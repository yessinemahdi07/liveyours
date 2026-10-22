let currentMode = 'quick';

function switchTab(tabId, event) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');

    if(tabId === 'dashboard') { fetchActivities(); fetchTasks(); fetchSystemStats(); }
    if(tabId === 'library') { fetchFiles(); }
}

async function fetchSystemStats() {
    try {
        const res = await fetch('/api/system'); const data = await res.json();
        document.getElementById('cpu-val').innerText = `CPU: ${data.cpu}%`;
        document.getElementById('ram-val').innerText = `RAM: ${data.ram}%`;
    } catch(e) {}
}

// --- FILE UPLOAD ---
async function uploadFile(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const zone = document.getElementById('drop-zone');
    zone.innerHTML = `<p>Uploading and parsing ${file.name}...</p>`;

    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if(data.error) alert(data.error);
        else { alert("File uploaded successfully!"); fetchFiles(); }
    } catch(e) { alert("Upload failed."); }
    zone.innerHTML = `<p>Drag & Drop or <label for="file-input" class="btn-text">Browse</label></p>`;
}

async function fetchFiles() {
    try {
        const res = await fetch('/api/get_files'); const data = await res.json();
        const list = document.getElementById('file-list');
        list.innerHTML = data.files.length ? '' : '<li class="subtext">No files uploaded yet.</li>';
        data.files.forEach(f => { list.innerHTML += `<li><span>📄 ${f.name}</span></li>`; });
    } catch(e) {}
}

// --- ACTIVITIES ---
async function fetchActivities() {
    try {
        const res = await fetch('/api/get_activities'); const data = await res.json();
        document.getElementById('gym-count').innerText = data.Gym;
        document.getElementById('run-count').innerText = data.Run;
        document.getElementById('km-count').innerText = data.Km.toFixed(1);
    } catch(e) {}
}

async function logActivity(type) {
    let dist = 0;
    if(type === 'Run') {
        const val = prompt("How many kilometers did you run?", "5");
        if (val === null) return;
        dist = parseFloat(val);
    }
    await fetch('/api/add_activity', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({type: type, distance: dist}) });
    fetchActivities();
}

// --- TASKS ---
async function fetchTasks() {
    try {
        const res = await fetch('/api/get_tasks'); const data = await res.json();
        const list = document.getElementById('task-list'); list.innerHTML = '';
        data.tasks.forEach(t => {
            list.innerHTML += `<li><div onclick="completeTask(${t.id})"><div class="task-checkbox"></div>${t.text}</div><span class="lbl">${t.cat}</span></li>`;
        });
    } catch(e) {}
}
async function completeTask(id) {
    await fetch('/api/complete_task', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: id}) });
    fetchTasks();
}

// --- CHAT ---
function setMode(mode, btn) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function handleChatKeyPress(e) { if (e.key === 'Enter') sendMessage(); }
async function sendMessage() {
    const input = document.getElementById('chat-input'), text = input.value.trim(), area = document.getElementById('chat-messages');
    if (!text) return;
    area.innerHTML += `<div class="msg-user">${text}</div>`; input.value = ''; area.scrollTop = area.scrollHeight;
    try {
        const res = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message: text, mode: currentMode}) });
        const data = await res.json();
        area.innerHTML += `<div class="msg-bot">${data.reply}</div>`;
        area.scrollTop = area.scrollHeight;
    } catch(e) { area.innerHTML += `<div class="msg-bot" style="color:red;">Connection failed.</div>`; }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchActivities(); fetchTasks(); fetchSystemStats(); setInterval(fetchSystemStats, 5000);
});
