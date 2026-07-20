import {
  auth, db, googleProvider, isAdminUser, slotId, ADMIN_EMAIL,
  signInWithPopup, onAuthStateChanged, signOut,
  collection, doc, getDocs, deleteDoc, updateDoc, query, orderBy
} from "./firebase.js";

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

let bookings=[]; // {id, ...data}
let filter="upcoming";

const gate=$("#gate");
const portal=$("#portal");

$("#gateSignIn").addEventListener("click",async()=>{
  try{await signInWithPopup(auth,googleProvider)}
  catch(e){/* user closed popup */}
});
$("#signOutBtn").addEventListener("click",()=>signOut(auth));
$("#refreshBtn").addEventListener("click",loadBookings);

onAuthStateChanged(auth,user=>{
  if(isAdminUser(user)){
    gate.style.display="none";
    portal.style.display="block";
    $("#whoami").textContent="Signed in as "+user.email;
    loadBookings();
  }else{
    portal.style.display="none";
    gate.style.display="block";
    $("#gateMsg").textContent=user
      ? `${user.email} doesn't have admin access. Sign in with ${ADMIN_EMAIL}.`
      : "Sign in with the admin account to continue.";
    $("#gateSignIn").textContent=user?"Switch account":"Sign in with Google";
    if(user)$("#gateSignIn").onclick=async()=>{await signOut(auth);signInWithPopup(auth,googleProvider).catch(()=>{})};
  }
});

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
  const active=bookings.filter(b=>b.status!=="cancelled");
  $("#statUpcoming").textContent=active.filter(b=>b.date>=tk).length;
  $("#statToday").textContent=active.filter(b=>b.date===tk).length;
  $("#statTotal").textContent=bookings.length;
}

function inFilter(b){
  const tk=todayKey();
  if(filter==="all")return true;
  if(filter==="cancelled")return b.status==="cancelled";
  if(b.status==="cancelled")return false;
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
  $("#list").innerHTML=items.map(b=>`
    <div class="bk${b.status==="cancelled"?" cancelled":""}" data-id="${b.id}">
      <div class="bk-top">
        <span class="bk-ref">${esc(b.ref)}</span>
        <span class="bk-status">${esc(b.status||"confirmed")}</span>
      </div>
      <div class="bk-main">${esc(b.treatment)} — ${esc(b.name)}</div>
      <div class="bk-when">${prettyDate(b.date)} · ${esc(b.time)}</div>
      <div class="bk-meta">
        <span>Phone <b><a href="sms:${esc(b.phone)}">${esc(b.phone)}</a></b></span>
        ${b.email?`<span>Email <b><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></b></span>`:""}
        <span>Koha <b>$${esc(b.price)}</b></span>
        ${b.firstVisit?`<span><b>First visit</b></span>`:""}
      </div>
      ${b.notes?`<div class="bk-notes">${esc(b.notes)}</div>`:""}
      <div class="bk-actions">
        ${b.status==="cancelled"
          ?`<button data-act="restore">Restore</button>
            <button data-act="delete" class="danger">Delete forever</button>`
          :`<button data-act="cancel" class="danger">Cancel booking</button>`}
      </div>
    </div>`).join("");
  $$(".bk-actions button").forEach(btn=>btn.addEventListener("click",()=>{
    const id=btn.closest(".bk").dataset.id;
    const act=btn.dataset.act;
    const b=bookings.find(x=>x.id===id);
    if(act==="cancel")cancelBooking(b);
    if(act==="restore")restoreBooking(b);
    if(act==="delete")deleteBooking(b);
  }));
}

$$(".filter-btn").forEach(btn=>btn.addEventListener("click",()=>{
  filter=btn.dataset.filter;
  $$(".filter-btn").forEach(b=>b.classList.toggle("active",b===btn));
  renderList();
}));

async function cancelBooking(b){
  if(!confirm(`Cancel ${b.ref} (${b.name}, ${b.date} ${b.time})?\nThis frees the time slot for others.`))return;
  try{
    await updateDoc(doc(db,"bookings",b.id),{status:"cancelled"});
    await deleteDoc(doc(db,"slots",slotId(b.date,b.time))).catch(()=>{});
    b.status="cancelled";
    renderStats();renderList();
    showToast("Booking cancelled — slot freed");
  }catch(e){showToast("Couldn't cancel — try again")}
}

async function restoreBooking(b){
  try{
    await updateDoc(doc(db,"bookings",b.id),{status:"confirmed"});
    b.status="confirmed";
    renderStats();renderList();
    showToast("Booking restored — note: re-block the slot manually if needed");
  }catch(e){showToast("Couldn't restore — try again")}
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
