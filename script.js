(function(){
"use strict";

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
const STORE_KEY="taw_bookings_v1";
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
  confirmed:null
};

function loadBookings(){
  try{return JSON.parse(localStorage.getItem(STORE_KEY))||[]}catch(e){return[]}
}
function saveBooking(b){
  const all=loadBookings();
  all.push(b);
  try{localStorage.setItem(STORE_KEY,JSON.stringify(all))}catch(e){}
}
function isBooked(dateKey,time){
  return loadBookings().some(b=>b.date===dateKey&&b.time===time);
}

function seedRand(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return()=>{
    h+=h<<13;h^=h>>>7;h+=h<<3;h^=h>>>17;h+=h<<5;
    return((h>>>0)%1000)/1000;
  };
}
function slotAvailability(dateKey){
  const rnd=seedRand(dateKey);
  return SLOT_TIMES.map(t=>({time:t,taken:rnd()<0.3||isBooked(dateKey,t)}));
}

function dateKey(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function prettyDate(key){
  const[y,m,d]=key.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  const wd=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dt.getDay()];
  return `${wd} ${d} ${MONTHS[m-1]} ${y}`;
}
function startOfToday(){const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate())}

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
    details:{name:"",phone:"",email:"",firstVisit:false,notes:""},
    confirmed:null
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
    nextBtn.textContent=state.step===4?"Confirm Booking":"Continue";
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

function renderTime(){
  const slots=slotAvailability(state.date);
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
    renderTime();
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
        <input id="fPhone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(d.phone)}" placeholder="0275 212 949">
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
        <path d="M40 72 C 21 72 10 58 10 40 C 10 23 23 12 40 12 C 55 12 65 23 65 37 C 65 49 56 56 46 56 C 37 56 31 50 31 42 C 31 35 36 31 42 31 C 47 31 50 35 50 39"/>
      </svg>
      <h4>Booking confirmed</h4>
      <div class="ref">${b.ref}</div>
      <p>${b.treatment} · ${prettyDate(b.date)} · ${b.time}</p>
      <p>You'll receive a text confirmation and a reminder the day before. To change or cancel, txt 0275 212 949.</p>
      <div class="demo-tag">Demo mode — no real appointment was created</div>
    </div>`;
}

function confirmBooking(){
  const t=TREATMENTS[state.duration];
  const ref="TAW-"+Math.random().toString(36).slice(2,6).toUpperCase()+"-"+String(Math.floor(Math.random()*900)+100);
  const booking={
    ref,
    treatment:t.label,
    duration:t.mins,
    price:state.price,
    date:state.date,
    time:state.time,
    ...state.details,
    createdAt:new Date().toISOString()
  };
  saveBooking(booking);
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
  if(state.step>0&&!state.confirmed){state.step--;render()}
});
$("#modalClose").addEventListener("click",closeModal);
modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&modal.classList.contains("open"))closeModal();
});

$$("[data-book]").forEach(btn=>btn.addEventListener("click",()=>openModal(btn.dataset.duration)));

function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

const burger=$("#burger");
const mobileMenu=$("#mobileMenu");
function closeMenu(){
  burger.classList.remove("open");
  burger.setAttribute("aria-expanded","false");
  mobileMenu.classList.remove("open");
  if(!modal.classList.contains("open"))document.body.classList.remove("locked");
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

})();
