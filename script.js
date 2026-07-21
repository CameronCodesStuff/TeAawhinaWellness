import {
  auth, db, googleProvider, isAdminUser, slotId, SMS_ENDPOINT,
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged, signOut,
  collection, doc, getDocs, query, where, writeBatch, serverTimestamp
} from "./firebase.js";

const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>[...c.querySelectorAll(s)];

const TREATMENTS={
  "45":{mins:45,min:65,max:75,label:"45 min Romiromi"},
  "60":{mins:60,min:80,max:150,label:"60 min Romiromi"},
  "90":{mins:90,min:150,max:220,label:"90 min Romiromi"}
};
const OPEN_DAYS=[2,3,4,5,6];
const SLOT_TIMES=["9:00 am","10:15 am","11:30 am","12:45 pm","2:00 pm","3:15 pm"];
const BOOK_AHEAD_DAYS=60;
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const state={
  step:0,
  duration:null,
  price:null,
  date:null,
  time:null,
  calYear:0,
  calMonth:0,
  details:{name:"",phone:"",email:"",firstVisit:false,notes:""},
  confirmed:null,
  saving:false
};

let currentUser=null;

/* ---------------- helpers ---------------- */

function dateKey(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function prettyDate(key){
  const[y,m,d]=key.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  const wd=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dt.getDay()];
  return `${wd} ${d} ${MONTHS[m-1]} ${y}`;
}
function startOfToday(){const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate())}
function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function friendlyAuthError(e){
  const code=(e&&e.code)||"";
  if(code.includes("invalid-credential")||code.includes("wrong-password")||code.includes("user-not-found"))return "Email or password is incorrect.";
  if(code.includes("email-already-in-use"))return "An account with that email already exists — try signing in.";
  if(code.includes("weak-password"))return "Password needs to be at least 6 characters.";
  if(code.includes("invalid-email"))return "That email doesn't look right.";
  if(code.includes("popup-closed"))return "Sign-in was cancelled.";
  if(code.includes("too-many-requests"))return "Too many attempts — please wait a moment.";
  return "Something went wrong — please try again.";
}

/* ---------------- Firestore: slots ---------------- */

async function fetchTakenTimes(dKey){
  const snap=await getDocs(query(collection(db,"slots"),where("date","==",dKey)));
  const taken=new Set();
  snap.forEach(d=>taken.add(d.data().time));
  return taken;
}

/* ---------------- booking modal ---------------- */

const modal=$("#bookingModal");
const modalBody=$("#modalBody");
const backBtn=$("#backBtn");
const nextBtn=$("#nextBtn");
const stepsFill=$("#stepsFill");
const stepLabels=$$("#stepLabels span");
const toast=$("#toast");
let lastFocus=null;

function openModal(preDuration){
  lastFocus=document.activeElement;
  const today=startOfToday();
  Object.assign(state,{
    step:0,duration:null,price:null,date:null,time:null,
    calYear:today.getFullYear(),calMonth:today.getMonth(),
    details:{
      name:currentUser?.displayName||"",
      phone:"",
      email:currentUser?.email||"",
      firstVisit:false,notes:""
    },
    confirmed:null,saving:false
  });
  if(preDuration&&TREATMENTS[preDuration]){
    state.duration=preDuration;
    const t=TREATMENTS[preDuration];
    state.price=Math.round((t.min+t.max)/2/5)*5;
  }
  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
  document.body.classList.add("locked");
  closeMenu();
  render();
  $("#modalClose").focus();
}
function closeModal(){
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
  document.body.classList.remove("locked");
  if(lastFocus)lastFocus.focus();
}

function showToast(msg){
  toast.textContent=msg;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>toast.classList.remove("show"),3200);
}

function render(){
  const pct=state.confirmed?100:((state.step+1)/5)*100;
  stepsFill.style.width=pct+"%";
  stepLabels.forEach((el,i)=>{
    el.classList.toggle("active",i===state.step&&!state.confirmed);
    el.classList.toggle("done",i<state.step||!!state.confirmed);
  });
  backBtn.classList.toggle("hidden",state.step===0||!!state.confirmed);
  if(state.confirmed){
    nextBtn.textContent="Done";
    nextBtn.disabled=false;
    renderConfirmed();
  }else{
    nextBtn.textContent=state.step===4?(state.saving?"Booking…":"Confirm Booking"):"Continue";
    [renderTreatment,renderDate,renderTime,renderDetails,renderReview][state.step]();
    updateNextState();
  }
  modalBody.scrollTop=0;
}

function updateNextState(){
  let ok=true;
  if(state.step===0)ok=!!state.duration;
  if(state.step===1)ok=!!state.date;
  if(state.step===2)ok=!!state.time;
  if(state.step===3)ok=detailsValid(false);
  if(state.saving)ok=false;
  nextBtn.disabled=!ok;
}

function renderTreatment(){
  const opts=Object.entries(TREATMENTS).map(([k,t])=>`
    <button type="button" class="treat-opt${state.duration===k?" selected":""}" data-dur="${k}">
      <span class="t-dur">${t.mins} <small>mins</small></span>
      <span class="t-range">$${t.min} – $${t.max}</span>
      <span class="t-check"></span>
    </button>`).join("");
  let scale="";
  if(state.duration){
    const t=TREATMENTS[state.duration];
    if(state.price==null)state.price=Math.round((t.min+t.max)/2/5)*5;
    const fill=((state.price-t.min)/(t.max-t.min))*100;
    scale=`
    <div class="scale-block">
      <div class="scale-lbl">Sliding Scale Contribution</div>
      <div class="scale-hint">Choose what is sustainable for you — every koha within the scale is welcomed equally.</div>
      <div class="scale-value" id="scaleValue">$${state.price}</div>
      <input type="range" id="scaleRange" min="${t.min}" max="${t.max}" step="5" value="${state.price}" style="--fill:${fill}%">
      <div class="scale-ends"><span>$${t.min}</span><span>$${t.max}</span></div>
    </div>`;
  }
  modalBody.innerHTML=`<div class="step-title">Choose your treatment</div><div class="treat-opts">${opts}</div>${scale}`;
  $$(".treat-opt",modalBody).forEach(btn=>btn.addEventListener("click",()=>{
    state.duration=btn.dataset.dur;
    state.price=null;
    state.time=null;
    renderTreatment();
    updateNextState();
  }));
  const range=$("#scaleRange",modalBody);
  if(range)range.addEventListener("input",()=>{
    state.price=Number(range.value);
    const t=TREATMENTS[state.duration];
    range.style.setProperty("--fill",((state.price-t.min)/(t.max-t.min))*100+"%");
    $("#scaleValue",modalBody).textContent="$"+state.price;
  });
}

function renderDate(){
  const today=startOfToday();
  const limit=new Date(today);limit.setDate(limit.getDate()+BOOK_AHEAD_DAYS);
  const y=state.calYear,m=state.calMonth;
  const first=new Date(y,m,1);
  const daysIn=new Date(y,m+1,0).getDate();
  const pad=(first.getDay()+6)%7;
  const prevDisabled=y===today.getFullYear()&&m===today.getMonth();
  const lastVisible=new Date(y,m,daysIn);
  const nextDisabled=lastVisible>=limit;
  let cells="";
  for(let i=0;i<pad;i++)cells+=`<div class="cal-day pad"></div>`;
  for(let d=1;d<=daysIn;d++){
    const dt=new Date(y,m,d);
    const key=dateKey(y,m,d);
    const isPast=dt<today;
    const beyond=dt>limit;
    const open=OPEN_DAYS.includes(dt.getDay())&&!isPast&&!beyond;
    const cls=["cal-day",open?"open-day":"closed"];
    if(state.date===key)cls.push("selected");
    if(dt.getTime()===today.getTime())cls.push("today");
    cells+=`<button type="button" class="${cls.join(" ")}" data-key="${key}" ${open?"":"disabled"}>${d}</button>`;
  }
  modalBody.innerHTML=`
    <div class="step-title">Pick a day</div>
    <div class="cal-head">
      <div class="cal-month">${MONTHS[m]} ${y}</div>
      <div class="cal-nav">
        <button type="button" id="calPrev" aria-label="Previous month" ${prevDisabled?"disabled":""}>‹</button>
        <button type="button" id="calNext" aria-label="Next month" ${nextDisabled?"disabled":""}>›</button>
      </div>
    </div>
    <div class="cal-dow">${DOW.map(d=>`<span>${d}</span>`).join("")}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend">
      <span class="lg-open"><i></i>Clinic open</span>
      <span class="lg-closed"><i></i>Closed / unavailable</span>
    </div>`;
  $("#calPrev",modalBody).addEventListener("click",()=>{
    state.calMonth--;
    if(state.calMonth<0){state.calMonth=11;state.calYear--}
    renderDate();
  });
  $("#calNext",modalBody).addEventListener("click",()=>{
    state.calMonth++;
    if(state.calMonth>11){state.calMonth=0;state.calYear++}
    renderDate();
  });
  $$(".cal-day.open-day",modalBody).forEach(btn=>btn.addEventListener("click",()=>{
    state.date=btn.dataset.key;
    state.time=null;
    renderDate();
    updateNextState();
  }));
}

async function renderTime(){
  modalBody.innerHTML=`
    <div class="step-title">Choose a time</div>
    <div class="slot-date">${prettyDate(state.date)}</div>
    <div class="slot-loading">Checking availability…</div>`;
  let taken;
  try{
    taken=await fetchTakenTimes(state.date);
  }catch(e){
    modalBody.innerHTML=`
      <div class="step-title">Choose a time</div>
      <div class="slot-date">${prettyDate(state.date)}</div>
      <div class="slot-empty">Couldn't load availability — check your connection and try again.</div>`;
    return;
  }
  if(state.step!==2)return; // user navigated away while loading
  const slots=SLOT_TIMES.map(t=>({time:t,taken:taken.has(t)}));
  const anyFree=slots.some(s=>!s.taken);
  const grid=anyFree?`<div class="slot-grid">${slots.map(s=>`
    <button type="button" class="slot${s.taken?" taken":""}${state.time===s.time?" selected":""}" data-time="${s.time}" ${s.taken?"disabled":""}>${s.time}</button>`).join("")}</div>`
    :`<div class="slot-empty">This day is fully booked — please choose another day.</div>`;
  modalBody.innerHTML=`
    <div class="step-title">Choose a time</div>
    <div class="slot-date">${prettyDate(state.date)}</div>
    ${grid}`;
  $$(".slot:not(.taken)",modalBody).forEach(btn=>btn.addEventListener("click",()=>{
    state.time=btn.dataset.time;
    $$(".slot",modalBody).forEach(b=>b.classList.toggle("selected",b.dataset.time===state.time));
    updateNextState();
  }));
}

function detailsValid(mark){
  const d=state.details;
  const nameOk=d.name.trim().length>=2;
  const phoneOk=/^[\d\s+()-]{7,}$/.test(d.phone.trim());
  const emailOk=d.email.trim()===""||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim());
  if(mark){
    markErr("fName",!nameOk);
    markErr("fPhone",!phoneOk);
    markErr("fEmail",!emailOk);
  }
  return nameOk&&phoneOk&&emailOk;
}
function markErr(id,bad){
  const input=$("#"+id,modalBody);
  if(!input)return;
  input.classList.toggle("err",bad);
  input.closest(".field").classList.toggle("show-err",bad);
}

function renderDetails(){
  const d=state.details;
  modalBody.innerHTML=`
    <div class="step-title">Your details</div>
    <div class="form-grid">
      <div class="field">
        <label for="fName">Full name <b>*</b></label>
        <input id="fName" type="text" autocomplete="name" value="${esc(d.name)}" placeholder="Your name">
        <div class="field-err">Please enter your name.</div>
      </div>
      <div class="field">
        <label for="fPhone">Phone <b>*</b></label>
        <input id="fPhone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(d.phone)}" placeholder="027 123 4567">
        <div class="field-err">Please enter a valid phone number.</div>
      </div>
      <div class="field">
        <label for="fEmail">Email</label>
        <input id="fEmail" type="email" inputmode="email" autocomplete="email" value="${esc(d.email)}" placeholder="you@example.com">
        <div class="field-err">That email doesn't look right.</div>
      </div>
      <button type="button" class="check-row${d.firstVisit?" on":""}" id="fFirst">
        <span class="box"></span>
        This is my first Romiromi treatment
      </button>
      <div class="field">
        <label for="fNotes">Anything you'd like me to know?</label>
        <textarea id="fNotes" placeholder="Injuries, areas of focus, accessibility needs…">${esc(d.notes)}</textarea>
      </div>
      ${currentUser?"":`<div class="signin-hint">Tip — <button type="button" class="link-btn" id="hintSignIn">sign in</button> to keep track of your bookings.</div>`}
    </div>`;
  const bind=(id,key)=>$("#"+id,modalBody).addEventListener("input",e=>{
    state.details[key]=e.target.value;
    updateNextState();
  });
  bind("fName","name");bind("fPhone","phone");bind("fEmail","email");bind("fNotes","notes");
  $("#fFirst",modalBody).addEventListener("click",e=>{
    state.details.firstVisit=!state.details.firstVisit;
    e.currentTarget.classList.toggle("on",state.details.firstVisit);
  });
  const hint=$("#hintSignIn",modalBody);
  if(hint)hint.addEventListener("click",()=>{closeModal();openAuth();});
}

function renderReview(){
  const t=TREATMENTS[state.duration];
  const d=state.details;
  modalBody.innerHTML=`
    <div class="step-title">Review your booking</div>
    <div class="review-card">
      <div class="review-row"><span class="rk">Treatment</span><span class="rv">${t.label}</span></div>
      <div class="review-row"><span class="rk">When</span><span class="rv">${prettyDate(state.date)}<br>${state.time}</span></div>
      <div class="review-row"><span class="rk">Where</span><span class="rv">Community Clinic, Maketū</span></div>
      <div class="review-row"><span class="rk">Koha</span><span class="rv gold">$${state.price}</span></div>
      <div class="review-row"><span class="rk">Name</span><span class="rv">${esc(d.name)}</span></div>
      <div class="review-row"><span class="rk">Phone</span><span class="rv">${esc(d.phone)}</span></div>
      ${d.email?`<div class="review-row"><span class="rk">Email</span><span class="rv">${esc(d.email)}</span></div>`:""}
      ${d.firstVisit?`<div class="review-row"><span class="rk">Note</span><span class="rv">First visit</span></div>`:""}
      ${d.notes?`<div class="review-row"><span class="rk">Notes</span><span class="rv">${esc(d.notes)}</span></div>`:""}
    </div>
    <div class="review-note">Payment is made at your appointment. Treatments are provided fully clothed.</div>`;
}

function renderConfirmed(){
  const b=state.confirmed;
  modalBody.innerHTML=`
    <div class="confirm-wrap">
      <svg class="confirm-koru" viewBox="0 0 80 80" fill="none">
        <path d="M15.3 8.0L15.5 10.0L15.7 12.0L15.9 14.0L16.1 16.1L16.4 18.1L16.7 20.1L17.0 22.1L17.3 24.1L17.6 26.1L18.0 28.1L18.4 30.1L18.8 32.0L19.2 34.0L19.7 36.0L20.2 37.9L20.8 39.9L21.4 41.8L22.1 43.7L22.7 45.6L23.5 47.5L24.3 49.4L25.1 51.2L26.1 53.0L27.0 54.8L28.1 56.5L29.2 58.2L30.4 59.9L31.6 61.5L33.0 63.0L34.4 64.4L35.9 65.8L37.5 67.1L39.1 68.2L40.9 69.2L42.7 70.1L44.6 70.9L46.5 71.4L48.5 71.8L50.5 72.0L52.6 71.9L54.6 71.6L56.5 71.1L58.4 70.3L60.1 69.2L61.6 67.9L62.9 66.3L63.9 64.6L64.5 62.6L64.7 60.6L64.4 58.6L63.7 56.7L62.5 55.1L60.9 53.9L59.0 53.2L57.0 53.1L55.1 53.7L53.5 55.0L52.6 56.8L52.5 58.8L53.3 60.7L54.9 61.9L56.9 62.1L58.7 61.3L59.6 59.5L59.3 57.6L57.8 56.3L57.0 56.1"/>
      </svg>
      <h4>Booking confirmed</h4>
      <div class="ref">${b.ref}</div>
      <p>${esc(b.treatment)} · ${prettyDate(b.date)} · ${b.time}</p>
      <p>A text confirmation is on its way to your phone. To change or cancel, txt 0275 212 949.</p>
    </div>`;
}

/* ---------------- confirm: Firestore + SMS ---------------- */

async function confirmBooking(){
  if(state.saving)return;
  state.saving=true;
  nextBtn.disabled=true;
  nextBtn.textContent="Booking…";

  const t=TREATMENTS[state.duration];
  const ref="TAW-"+Math.random().toString(36).slice(2,6).toUpperCase()+"-"+String(Math.floor(Math.random()*900)+100);
  const booking={
    ref,
    treatment:t.label,
    duration:t.mins,
    price:state.price,
    date:state.date,
    time:state.time,
    name:state.details.name.trim(),
    phone:state.details.phone.trim(),
    email:state.details.email.trim(),
    firstVisit:state.details.firstVisit,
    notes:state.details.notes.trim(),
    uid:currentUser?currentUser.uid:null,
    status:"confirmed",
    createdAt:serverTimestamp()
  };

  try{
    const batch=writeBatch(db);
    // Creating the slot doc reserves the time — the batch fails if it already exists,
    // so two people can never book the same slot.
    const slotRef=doc(db,"slots",slotId(state.date,state.time));
    batch.set(slotRef,{date:state.date,time:state.time,createdAt:serverTimestamp()});
    batch.set(doc(collection(db,"bookings")),booking);
    await batch.commit();
  }catch(e){
    state.saving=false;
    showToast("That time was just taken — please pick another.");
    state.step=2;
    state.time=null;
    render();
    return;
  }

  // Fire the SMS worker — booking is already saved, so don't block on this.
  fetch(SMS_ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      ref,
      treatment:t.label,
      date:prettyDate(state.date),
      time:state.time,
      price:state.price,
      name:booking.name,
      phone:booking.phone,
      email:booking.email
    })
  }).then(r=>r.json())
    .then(d=>console.log("SMS worker:",d))
    .catch(e=>console.warn("SMS worker unreachable:",e));

  state.saving=false;
  state.confirmed=booking;
  render();
  showToast("Booking "+ref+" confirmed ✦");
}

nextBtn.addEventListener("click",()=>{
  if(state.confirmed){closeModal();return}
  if(state.step===3&&!detailsValid(true)){updateNextState();return}
  if(state.step===4){confirmBooking();return}
  state.step++;
  render();
});
backBtn.addEventListener("click",()=>{
  if(state.step>0&&!state.confirmed&&!state.saving){state.step--;render()}
});
$("#modalClose").addEventListener("click",closeModal);
modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});

$$("[data-book]").forEach(btn=>btn.addEventListener("click",()=>openModal(btn.dataset.duration)));

/* ---------------- auth modal ---------------- */

const authModal=$("#authModal");
const authBody=$("#authBody");
let authMode="signin";

function openAuth(){
  authMode="signin";
  renderAuth();
  authModal.classList.add("open");
  authModal.setAttribute("aria-hidden","false");
  document.body.classList.add("locked");
  closeMenu();
}
function closeAuth(){
  authModal.classList.remove("open");
  authModal.setAttribute("aria-hidden","true");
  if(!modal.classList.contains("open"))document.body.classList.remove("locked");
}

function renderAuth(msg,isErr){
  const signin=authMode==="signin";
  authBody.innerHTML=`
    <div class="auth-tabs">
      <button type="button" class="auth-tab${signin?" active":""}" data-mode="signin">Sign in</button>
      <button type="button" class="auth-tab${!signin?" active":""}" data-mode="signup">Create account</button>
    </div>
    <button type="button" class="google-btn" id="googleBtn">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M12 5.04c1.68 0 3.19.58 4.38 1.71l3.27-3.27C17.66 1.6 15.05.5 12 .5 7.31.5 3.26 3.19 1.28 7.12l3.81 2.96C6.02 7.24 8.77 5.04 12 5.04z"/><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.46H12v4.65h6.45c-.28 1.5-1.12 2.77-2.39 3.62l3.69 2.87c2.16-2 3.75-4.94 3.75-8.68z"/><path fill="#FBBC05" d="M5.09 14.09A7.03 7.03 0 0 1 4.72 12c0-.73.13-1.43.36-2.09L1.28 6.95A11.48 11.48 0 0 0 .5 12c0 1.85.44 3.6 1.22 5.15l3.37-3.06z"/><path fill="#34A853" d="M12 23.5c3.1 0 5.71-1.02 7.61-2.78l-3.69-2.87c-1.02.69-2.34 1.1-3.92 1.1-3.23 0-5.98-2.18-6.96-5.12l-3.76 3.06C3.26 20.81 7.31 23.5 12 23.5z"/></svg>
      Continue with Google
    </button>
    <div class="auth-or"><span>or with email</span></div>
    <div class="form-grid">
      <div class="field">
        <label for="aEmail">Email</label>
        <input id="aEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">
      </div>
      <div class="field">
        <label for="aPass">Password</label>
        <input id="aPass" type="password" autocomplete="${signin?"current-password":"new-password"}" placeholder="${signin?"Your password":"At least 6 characters"}">
      </div>
    </div>
    ${msg?`<div class="auth-msg${isErr?" err":""}">${esc(msg)}</div>`:""}
    <button type="button" class="btn btn-gold auth-submit" id="authSubmit">${signin?"Sign in":"Create account"}</button>
    ${signin?`<button type="button" class="link-btn auth-forgot" id="forgotBtn">Forgot password?</button>`:""}
  `;
  $$(".auth-tab",authBody).forEach(b=>b.addEventListener("click",()=>{
    authMode=b.dataset.mode;
    renderAuth();
  }));
  $("#googleBtn",authBody).addEventListener("click",async()=>{
    try{
      await signInWithPopup(auth,googleProvider);
      closeAuth();
      showToast("Kia ora — you're signed in ✦");
    }catch(e){renderAuth(friendlyAuthError(e),true)}
  });
  const submit=async()=>{
    const email=$("#aEmail",authBody).value.trim();
    const pass=$("#aPass",authBody).value;
    if(!email||!pass){renderAuth("Please enter your email and password.",true);return}
    try{
      if(authMode==="signin")await signInWithEmailAndPassword(auth,email,pass);
      else await createUserWithEmailAndPassword(auth,email,pass);
      closeAuth();
      showToast("Kia ora — you're signed in ✦");
    }catch(e){renderAuth(friendlyAuthError(e),true)}
  };
  $("#authSubmit",authBody).addEventListener("click",submit);
  $("#aPass",authBody).addEventListener("keydown",e=>{if(e.key==="Enter")submit()});
  const forgot=$("#forgotBtn",authBody);
  if(forgot)forgot.addEventListener("click",async()=>{
    const email=$("#aEmail",authBody).value.trim();
    if(!email){renderAuth("Enter your email first, then tap forgot password.",true);return}
    try{
      await sendPasswordResetEmail(auth,email);
      renderAuth("Password reset email sent — check your inbox.");
    }catch(e){renderAuth(friendlyAuthError(e),true)}
  });
}

$("#authClose").addEventListener("click",closeAuth);
authModal.addEventListener("click",e=>{if(e.target===authModal)closeAuth()});

/* ---------------- account menu ---------------- */

const accountBtn=$("#accountBtn");
const accountMenu=$("#accountMenu");
const signInBtn=$("#signInBtn");
const mobileSignIn=$("#mobileSignIn");

function updateAuthUI(){
  const signedIn=!!currentUser;
  signInBtn.classList.toggle("hidden",signedIn);
  mobileSignIn.textContent=signedIn?"Sign out":"Sign in";
  $("#mobileBookings").classList.toggle("hidden",!signedIn);
  accountBtn.classList.toggle("hidden",!signedIn);
  if(signedIn){
    const initial=(currentUser.displayName||currentUser.email||"?").trim()[0].toUpperCase();
    $("#accountInitial").textContent=initial;
    $("#menuEmail").textContent=currentUser.email||"";
    $("#menuAdmin").classList.toggle("hidden",!isAdminUser(currentUser));
  }else{
    accountMenu.classList.remove("open");
  }
}

accountBtn.addEventListener("click",e=>{
  e.stopPropagation();
  accountMenu.classList.toggle("open");
});
document.addEventListener("click",e=>{
  if(!accountMenu.contains(e.target))accountMenu.classList.remove("open");
});
signInBtn.addEventListener("click",openAuth);
mobileSignIn.addEventListener("click",()=>{
  closeMenu();
  if(currentUser)signOut(auth);
  else openAuth();
});
$("#menuSignOut").addEventListener("click",async()=>{
  accountMenu.classList.remove("open");
  await signOut(auth);
  showToast("Signed out");
});
$("#menuBookings").addEventListener("click",()=>{
  accountMenu.classList.remove("open");
  openMy();
});
$("#mobileBookings").addEventListener("click",()=>{
  closeMenu();
  openMy();
});

onAuthStateChanged(auth,user=>{
  currentUser=user;
  updateAuthUI();
});

/* ---------------- my bookings ---------------- */

const myModal=$("#myModal");
const myBody=$("#myBody");

async function openMy(){
  if(!currentUser)return;
  myModal.classList.add("open");
  myModal.setAttribute("aria-hidden","false");
  document.body.classList.add("locked");
  myBody.innerHTML=`<div class="slot-loading">Loading your bookings…</div>`;
  try{
    const snap=await getDocs(query(
      collection(db,"bookings"),
      where("uid","==",currentUser.uid)
    ));
    const items=[];
    snap.forEach(d=>items.push(d.data()));
    items.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    if(!items.length){
      myBody.innerHTML=`<div class="slot-empty">No bookings yet — when you book while signed in, they'll show here.</div>`;
      return;
    }
    myBody.innerHTML=items.map(b=>`
      <div class="my-booking${b.status==="cancelled"?" cancelled":""}">
        <div class="mb-top"><span class="mb-ref">${esc(b.ref)}</span><span class="mb-status">${esc(b.status)}</span></div>
        <div class="mb-main">${esc(b.treatment)}</div>
        <div class="mb-when">${prettyDate(b.date)} · ${esc(b.time)}</div>
      </div>`).join("");
  }catch(e){
    myBody.innerHTML=`<div class="slot-empty">Couldn't load bookings — please try again.</div>`;
  }
}
function closeMy(){
  myModal.classList.remove("open");
  myModal.setAttribute("aria-hidden","true");
  if(!modal.classList.contains("open"))document.body.classList.remove("locked");
}
$("#myClose").addEventListener("click",closeMy);
myModal.addEventListener("click",e=>{if(e.target===myModal)closeMy()});

document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  if(authModal.classList.contains("open")){closeAuth();return}
  if(myModal.classList.contains("open")){closeMy();return}
  if(modal.classList.contains("open"))closeModal();
});

/* ---------------- nav / decoration ---------------- */

const burger=$("#burger");
const mobileMenu=$("#mobileMenu");
function closeMenu(){
  burger.classList.remove("open");
  burger.setAttribute("aria-expanded","false");
  mobileMenu.classList.remove("open");
  if(!modal.classList.contains("open")&&!authModal.classList.contains("open"))document.body.classList.remove("locked");
}
burger.addEventListener("click",()=>{
  const open=!mobileMenu.classList.contains("open");
  burger.classList.toggle("open",open);
  burger.setAttribute("aria-expanded",String(open));
  mobileMenu.classList.toggle("open",open);
  document.body.classList.toggle("locked",open);
});
$$("#mobileMenu a").forEach(a=>a.addEventListener("click",closeMenu));

function buildTukutuku(){
  let a="",b="";
  for(let x=0,i=0;x<520;x+=16,i++){
    const d=`M${x} 8 L${x+8} 0 L${x+16} 8 L${x+8} 16 Z `;
    if(i%2===0)a+=d;else b+=d;
  }
  $$(".tk-a").forEach(p=>p.setAttribute("d",a.trim()));
  $$(".tk-b").forEach(p=>p.setAttribute("d",b.trim()));
}
buildTukutuku();

const obs=new IntersectionObserver(es=>{
  es.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add("in");obs.unobserve(e.target)}
  });
},{threshold:.12});
$$(".reveal").forEach(el=>obs.observe(el));
