let socket;
const API = '';

function el(id){return document.getElementById(id)}

// UI elements
const showRegister = el('showRegister'), showLogin = el('showLogin'), logoutBtn = el('logout');
const modal = el('modal'), modalTitle = el('modalTitle'), modalSubmit = el('modalSubmit'), modalClose = el('modalClose');
const mUsername = el('mUsername'), mPassword = el('mPassword');
const textInput = el('text'), sendBtn = el('send');
const messagesEl = el('messages');

function getToken(){return localStorage.getItem('token')}
function setUserUI(){
  const token = getToken();
  if(token){
    showRegister.style.display='none'; showLogin.style.display='none'; logoutBtn.style.display='inline-block';
    fetch('/api/messages').then(r=>r.json()).then(renderMessages)
    fetch('/api/statuses').then(r=>r.json()).then(renderStatuses)
    fetchProfile()
    startSocket();
  } else {
    showRegister.style.display='inline-block'; showLogin.style.display='inline-block'; logoutBtn.style.display='none';
    messagesEl.innerHTML = '<div style="color:#6b7280">Login untuk mulai chat.</div>';
    stopSocket();
  }
}

function renderMessages(msgs){
  messagesEl.innerHTML=''
  msgs.forEach(m=>appendMessage(m))
}

function appendMessage(m){
  const d = document.createElement('div');
  d.className='msg';
  d.innerHTML = `<div style="font-size:12px;font-weight:600">${escapeHtml(m.username||m.name||'Unknown')}</div><div>${escapeHtml(m.text||'')}</div><div style="font-size:11px;color:#6b7280">${new Date(m.created_at).toLocaleString()}</div>`;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderStatuses(list){
  const holder = el('statuses'); holder.innerHTML='';
  list.forEach(s=>{
    const node = document.createElement('div'); node.className='status-item';
    node.innerHTML = `<img src="${s.img}"><div style="font-size:12px">${escapeHtml(s.username||s.name||'')}</div>`
    holder.appendChild(node);
  })
}

function escapeHtml(s){ if(!s) return ''; return s.toString().replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

function fetchProfile(){
  const user = JSON.parse(localStorage.getItem('user')||'null');
  if(user){ el('username').innerText = user.name || user.username; if(user.avatar) el('avatar').src = user.avatar }
}

// socket
function startSocket(){ if(socket) return; socket = io(); socket.on('connect', ()=>console.log('socket connected')); socket.on('history', msgs=>renderMessages(msgs)); socket.on('message', m=>appendMessage(m)); }
function stopSocket(){ if(!socket) return; socket.disconnect(); socket=null; }

// events
showRegister.onclick = ()=>{ modalTitle.innerText='Register'; modal.style.display='flex'; modalSubmit.onclick = doRegister }
showLogin.onclick = ()=>{ modalTitle.innerText='Login'; modal.style.display='flex'; modalSubmit.onclick = doLogin }
modalClose.onclick = ()=>{ modal.style.display='none'; }
logoutBtn.onclick = ()=>{ localStorage.removeItem('token'); localStorage.removeItem('user'); setUserUI(); }

async function doRegister(){
  const username = mUsername.value.trim(); const password = mPassword.value.trim(); if(!username||!password) return alert('fill');
  const res = await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,name:username})});
  const data = await res.json(); if(data.token){ localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); modal.style.display='none'; setUserUI(); } else alert(JSON.stringify(data));
}

async function doLogin(){
  const username = mUsername.value.trim(); const password = mPassword.value.trim(); if(!username||!password) return alert('fill');
  const res = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const data = await res.json(); if(data.token){ localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); modal.style.display='none'; setUserUI(); } else alert(JSON.stringify(data));
}

sendBtn.onclick = async ()=>{
  const text = textInput.value.trim(); if(!text) return;
  const token = getToken(); if(!token) return alert('Login dulu');
  const res = await fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({text})});
  const data = await res.json(); textInput.value='';
}

// upload profile
el('uploadProfile').onclick = async ()=>{
  const f = el('profileFile').files[0]; if(!f) return alert('pilih file');
  const fd = new FormData(); fd.append('profile', f);
  const token = getToken(); if(!token) return alert('login dulu');
  const res = await fetch('/api/upload-profile',{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});
  const data = await res.json(); if(data.url){ el('avatar').src = data.url; const user = JSON.parse(localStorage.getItem('user')||'null'); if(user){ user.avatar = data.url; localStorage.setItem('user', JSON.stringify(user)); } }
}

// upload status
el('uploadStatus').onclick = async ()=>{
  const f = el('statusFile').files[0]; if(!f) return alert('pilih file');
  const fd = new FormData(); fd.append('status', f);
  const token = getToken(); if(!token) return alert('login dulu');
  const res = await fetch('/api/status',{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});
  const data = await res.json(); if(data.url) fetch('/api/statuses').then(r=>r.json()).then(renderStatuses);
}

// initial
setUserUI();

