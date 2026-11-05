"use strict";
(function(root){
  let selected=null,owner=null,csrf='',generation=0,selecting=false;
  const $=id=>document.getElementById(id);
  async function scoped(url,options={}){
    if(!selected)throw Error('请先选择征程存档');
    const id=selected;
    if(options.body){const body=JSON.parse(options.body);body.save_id=id;options={...options,body:JSON.stringify(body)};}
    else url+=(url.includes('?')?'&':'?')+'save_id='+encodeURIComponent(id);
    return fetch(url,options);
  }
  async function request(url,method,body){
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});
    const data=await res.json();if(!res.ok)throw Error(data.error||'存档操作失败');return data;
  }
  function button(text,fn){const b=document.createElement('button');b.type='button';b.className='pixel-button';b.textContent=text;b.onclick=()=>Promise.resolve().then(fn).catch(e=>$('save-error').textContent=e.message);return b;}
  function draftChoice(){return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='pixel-dialog';dialog.innerHTML='<h2>八宫有未保存草稿</h2><p>请选择保存后返回选档、放弃本次草稿，或留在当前征程。</p>';
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    for(const [label,value] of [['保存并选档','save'],['放弃草稿并选档','discard'],['取消','cancel']]){
      const b=document.createElement('button');b.className='pixel-button';b.type='button';b.textContent=label;b.onclick=()=>finish(value);dialog.append(b);
    }
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish('cancel');});document.body.append(dialog);dialog.showModal();
  });}
  async function open(user,token){
    const current=++generation;selected=null;selecting=false;owner=user?.id??null;csrf=token;
    root.DaoBladeJourneyUI?.reset();root.DaoBladeEntry.show('slots');
    const box=$('save-selection');box.hidden=false;box.textContent='正在核对征程档案…';
    try{
      const data=await request('/api/saves','GET');if(current!==generation)return;
      if(data.owner_id!==owner)throw Error('身份已变化，请重新登录');
      box.textContent='';const title=document.createElement('h3');title.textContent=owner===null?'游客征程':'选择征程 · 三个独立存档';box.append(title);
      const cards=document.createElement('div');cards.className='save-cards';box.append(cards);
      for(let position=1;position<=(owner===null?1:3);position++){
        const save=data.saves.find(s=>s.position===position),card=document.createElement('article');card.className='save-card';cards.append(card);
        const h=document.createElement('h4');h.textContent=save?.name||`空存档位 ${position}`;card.append(h);
        if(!save){card.append(button('创建征程',async()=>{const name=prompt('为这段征程命名（1至20字）',`征程${position}`);if(name===null)return;await request('/api/saves','POST',{name});await open(user,token);}));continue;}
        const p=document.createElement('p');p.textContent=`${save.rank} · 调查 ${save.clears}/5 · ${save.chapter}\n${save.active_trial?'有未完成挑战 · 进入村中可恢复':'暂无进行中挑战'}${save.updated_at?'\n更新 '+save.updated_at+' UTC':''}`;card.append(p);
        card.append(button('进入征程',async()=>{
          if(current!==generation||selecting)return;selecting=true;
          try{selected=save.id;root.DaoBladeJourneyUI.reset();await root.DaoBladeJourneyUI.load();
            if(current!==generation)return;if(!root.DaoBladeJourneyUI.entrySummary()||root.DaoBladeJourneyUI.entrySummary().blocked)throw Error('读取失败，请重试此档案');
            box.hidden=true;root.DaoBladeEntry.enter();
          }finally{selecting=false;}
        }));
        if(owner!==null){
          card.append(button('重命名',async()=>{const name=prompt('存档新名称',save.name);if(name===null)return;await request('/api/saves/'+save.id,'PATCH',{name,revision:save.revision,version:save.version});await open(user,token);}));
          card.append(button('删除',async()=>{const confirm_name=prompt(`永久删除此征程及其进度。请输入“${save.name}”确认`);if(confirm_name===null)return;await request('/api/saves/'+save.id,'DELETE',{confirm_name,revision:save.revision,version:save.version});await open(user,token);}));
          if(save.empty)card.append(button('导入游客征程',async()=>{await request('/api/auth/import-guest','POST',{save_id:save.id});await open(user,token);}));
        }
      }
      const err=document.createElement('p');err.id='save-error';err.setAttribute('role','alert');box.append(err);
      box.append(button('重新读取',()=>open(user,token)),button('返回登录',()=>root.DaoBladeEntry.logout()));
      cards.querySelector('button')?.focus();
    }catch(e){if(current===generation){box.textContent=e.message;box.append(button('重试读取',()=>open(user,token)),button('返回登录',()=>root.DaoBladeEntry.logout()));}}
  }
  root.DaoBladeSaves={open,fetch:scoped,reset(){generation++;selected=null;$('save-selection').hidden=true;},async reselect(){
    const summary=root.DaoBladeJourneyUI.entrySummary();if(summary?.busy)throw Error('正在保存，请稍候');
    if(summary?.dirty){const choice=await draftChoice();if(choice==='cancel')return;if(choice==='save')await root.DaoBladeJourneyUI.saveDraft();}
    document.querySelector('#settings-dialog[open]')?.close();
    const res=await fetch('/api/auth/me'),me=await res.json();if(!res.ok)throw Error('身份读取失败');await open(me.user,me.csrf_token);
  }};
})(globalThis);
