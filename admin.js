import {
  auth, db, googleProvider, isAdminUser, slotId, SMS_ENDPOINT,
  signInWithPopup, onAuthStateChanged, signOut,
  collection, doc, getDocs, deleteDoc, updateDoc, query, orderBy
} from "./firebase.js";

const NOTIFY_ENDPOINT = SMS_ENDPOINT.replace(/\/send$/, "/notify");

const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>[...c.querySelectorAll(s)];
const toast=$("#toast");

function showToast(msg){
  toast.textContent=msg;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>toast.classList.remove("show"),3200);
}
function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function prettyDate(key){
  const[y,m,d]=key.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  const wd=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dt.getDay()];
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${wd} ${d} ${MONTHS[m-1]} ${y}`;
}
function todayKey(){
  const n=new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

let bookings=[];
let users=[];
let filter="pending";
let view="bookings";

const gate=$("#gate");
const portal=$("#portal");

$("#gateSignIn").addEventListener("click",()=>signInWithPopup(auth,googleProvider).catch(()=>{}));
$("#signOutBtn").addEventListener("click",()=>signOut(auth));
$("#refreshBtn").addEventListener("click",()=>{loadBookings();loadUsers();});

onAuthStateChanged(auth,user=>{
  if(isAdminUser(user)){
    gate.style.display="none";
    portal.style.display="block";
    $("#whoami").textContent="Signed in as "+user.email;
    loadBookings();
    loadUsers();
  }else{
    portal.style.display="none";
    gate.style.display="block";
    $("#gateMsg").textContent=user
      ? `${user.email} doesn't have admin access.`
      : "Sign in with an admin account to continue.";
    $("#gateSignIn").textContent=user?"Switch account":"Sign in with Google";
    if(user)$("#gateSignIn").onclick=async()=>{await signOut(auth);signInWithPopup(auth,googleProvider).catch(()=>{})};
  }
});

/* ---------- views ---------- */

$$(".view-btn").forEach(btn=>btn.addEventListener("click",()=>{
  view=btn.dataset.view;
  $$(".view-btn").forEach(b=>b.classList.toggle("active",b===btn));
  $("#bookingsView").style.display=view==="bookings"?"block":"none";
  $("#usersView").style.display=view==="users"?"block":"none";
}));

/* ---------- bookings ---------- */

async function loadBookings(){
  $("#list").innerHTML=`<div class="empty">Loading…</div>`;
  try{
    const snap=await getDocs(query(collection(db,"bookings"),orderBy("date","asc")));
    bookings=[];
    snap.forEach(d=>bookings.push({id:d.id,...d.data()}));
    bookings.sort((a,b)=>(a.date+" "+a.time).localeCompare(b.date+" "+b.time));
    renderStats();
    renderList();
  }catch(e){
    $("#list").innerHTML=`<div class="empty">Couldn't load bookings — check Firestore rules are deployed.</div>`;
  }
}

function renderStats(){
  const tk=todayKey();
  $("#statUpcoming").textContent=bookings.filter(b=>b.status==="confirmed"&&b.date>=tk).length;
  $("#statPending").textContent=bookings.filter(b=>b.status==="pending").length;
  $("#statTotal").textContent=bookings.length;
}

function inFilter(b){
  const tk=todayKey();
  if(filter==="all")return true;
  if(filter==="pending")return b.status==="pending";
  if(filter==="denied")return b.status==="denied"||b.status==="cancelled";
  if(b.status!=="confirmed")return false;
  if(filter==="upcoming")return b.date>=tk;
  if(filter==="past")return b.date<tk;
  return true;
}

function renderList(){
  const items=bookings.filter(inFilter);
  if(filter==="past")items.reverse();
  if(!items.length){
    $("#list").innerHTML=`<div class="empty">Nothing here.</div>`;
    return;
  }
  $("#list").innerHTML=items.map(b=>{
    const st=b.status||"pending";
    let actions="";
    if(st==="pending"){
      actions=`<button data-act="approve" class="approve">Approve</button>
               <button data-act="deny" class="danger">Deny</button>`;
    }else if(st==="confirmed"){
      actions=`<button data-act="deny" class="danger">Cancel &amp; notify</button>`;
    }else{
      actions=`<button data-act="delete" class="danger">Delete forever</button>`;
    }
    return `
    <div class="bk ${st}" data-id="${b.id}">
      <div class="bk-top">
        <span class="bk-ref">${esc(b.ref)}</span>
        <span class="bk-status st-${st}">${esc(st)}</span>
      </div>
      <div class="bk-main">${esc(b.treatment)} — ${esc(b.name)}</div>
      <div class="bk-when">${prettyDate(b.date)} · ${esc(b.time)}</div>
      <div class="bk-meta">
        <span>Phone <b><a href="sms:${esc(b.phone)}">${esc(b.phone)}</a></b></span>
        <span>Email <b><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></b></span>
        <span>Koha <b>$${esc(b.price)}</b></span>
        ${b.firstVisit?`<span><b>First visit</b></span>`:""}
      </div>
      ${b.notes?`<div class="bk-notes">${esc(b.notes)}</div>`:""}
      <div class="bk-actions">${actions}</div>
    </div>`;
  }).join("");
  $$(".bk-actions button").forEach(btn=>btn.addEventListener("click",()=>{
    const b=bookings.find(x=>x.id===btn.closest(".bk").dataset.id);
    const act=btn.dataset.act;
    if(act==="approve")approveBooking(b);
    if(act==="deny")denyBooking(b);
    if(act==="delete")deleteBooking(b);
  }));
}

$$("#bookingsView .filter-btn:not(.view-btn)").forEach(btn=>btn.addEventListener("click",()=>{
  filter=btn.dataset.filter;
  $$("#bookingsView .filter-btn:not(.view-btn)").forEach(b=>b.classList.toggle("active",b===btn));
  renderList();
}));

async function notifyClient(b,decision){
  try{
    const idToken=await auth.currentUser.getIdToken();
    const res=await fetch(NOTIFY_ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        idToken,decision,
        ref:b.ref,treatment:b.treatment,date:prettyDate(b.date),time:b.time,
        price:b.price,name:b.name,email:b.email
      })
    });
    const d=await res.json();
    console.log("Notify:",d);
    return d.ok;
  }catch(e){
    console.warn("Notify failed:",e);
    return false;
  }
}

async function approveBooking(b){
  try{
    await updateDoc(doc(db,"bookings",b.id),{status:"confirmed"});
    b.status="confirmed";
    renderStats();renderList();
    const sent=await notifyClient(b,"approved");
    showToast(sent?"Approved — confirmation email sent":"Approved — but the email failed (see console)");
  }catch(e){showToast("Couldn't approve — try again")}
}

async function denyBooking(b){
  if(!confirm(`Deny ${b.ref} (${b.name}, ${b.date} ${b.time})?\nThe time slot will be freed and the client emailed.`))return;
  try{
    await updateDoc(doc(db,"bookings",b.id),{status:"denied"});
    await deleteDoc(doc(db,"slots",slotId(b.date,b.time))).catch(()=>{});
    b.status="denied";
    renderStats();renderList();
    const sent=await notifyClient(b,"declined");
    showToast(sent?"Denied — client emailed, slot freed":"Denied &amp; slot freed — but the email failed");
  }catch(e){showToast("Couldn't deny — try again")}
}

async function deleteBooking(b){
  if(!confirm(`Permanently delete ${b.ref}? This can't be undone.`))return;
  try{
    await deleteDoc(doc(db,"bookings",b.id));
    bookings=bookings.filter(x=>x.id!==b.id);
    renderStats();renderList();
    showToast("Booking deleted");
  }catch(e){showToast("Couldn't delete — try again")}
}

/* ---------- users ---------- */

async function loadUsers(){
  $("#userList").innerHTML=`<div class="empty">Loading…</div>`;
  try{
    const snap=await getDocs(collection(db,"users"));
    users=[];
    snap.forEach(d=>users.push({id:d.id,...d.data()}));
    users.sort((a,b)=>(a.name||a.email||"").localeCompare(b.name||b.email||""));
    renderUsers();
  }catch(e){
    $("#userList").innerHTML=`<div class="empty">Couldn't load users — check Firestore rules are deployed.</div>`;
  }
}

function renderUsers(){
  if(!users.length){
    $("#userList").innerHTML=`<div class="empty">No accounts yet — users appear here after they sign in on the site.</div>`;
    return;
  }
  $("#userList").innerHTML=users.map(u=>`
    <div class="user-row">
      <div class="u-name">${esc(u.name)||'<span class="muted">No name yet</span>'}</div>
      <div class="u-mail">${u.email?`<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>`:'<span class="muted">—</span>'}</div>
      <div class="u-phone">${u.phone?`<a href="sms:${esc(u.phone)}">${esc(u.phone)}</a>`:'<span class="muted">No phone yet</span>'}</div>
    </div>`).join("");
}
