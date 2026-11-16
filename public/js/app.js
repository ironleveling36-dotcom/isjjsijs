let liveSource = null;
let currentRestaurant = null;

function getPhone() {
  return document.getElementById('phone-input').value.replace(/\D/g, '').slice(-10);
}
function logAuth(msg) {
  const el = document.getElementById('auth-log');
  if (el) el.textContent = msg;
}
function setSyncStatus(msg) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = msg;
}
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}
function unlock() {
  document.getElementById('panel').classList.remove('hidden');
}

function on(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

on('btn-new-key', async () => {
  const phone = getPhone();
  if (phone.length !== 10) return logAuth('Enter a 10-digit number.');
  const data = await post('/api/key/new', { phone });
  if (!data.ok) return logAuth(data.error || 'Key failed');
  document.getElementById('key-label').textContent = data.accessKey;
  document.getElementById('key-input').value = data.accessKey;
  logAuth('Key created. Paste JSON session next.');
  unlock();
});

on('btn-enter-key', async () => {
  const data = await post('/api/key/enter', { key: document.getElementById('key-input').value });
  if (!data.ok) return logAuth(data.error || 'Invalid key');
  document.getElementById('phone-input').value = data.phone;
  document.getElementById('key-label').textContent = data.accessKey;
  logAuth('Key accepted.');
  unlock();
});

on('btn-json-login', async () => {
  const phone = getPhone();
  let session;
  try { session = JSON.parse(document.getElementById('session-json').value || '{}'); }
  catch { return logAuth('Invalid JSON'); }
  const data = await post('/api/auth/json-login', { phone, session });
  logAuth(data.ok ? 'JSON login applied.' : (data.error || data.message));
  if (data.ok) startLiveSync(phone);
});

document.getElementById('btn-add-address').addEventListener('click', async () => {
  const data = await post('/api/address/add', {
    phone: getPhone(),
    address: document.getElementById('addr-input').value,
    lat: document.getElementById('lat-input').value,
    lng: document.getElementById('lng-input').value
  });
  document.getElementById('address-box').textContent = data.ok
    ? `Default ${data.addressState.defaultAddressId} · ${document.getElementById('addr-input').value}`
    : (data.error || 'Address failed');
});

on('btn-sync-address', async () => {
  const data = await post('/api/address/sync', { phone: getPhone() });
  const list = data.addressState?.addresses || [];
  document.getElementById('address-box').textContent = list.length
    ? list.map(a => a.address || a.address_line || a.id).join(' | ')
    : (data.error || 'No Swiggy addresses');
});

on('btn-restaurants', async () => {
  const lat = document.getElementById('lat-input').value;
  const lng = document.getElementById('lng-input').value;
  const data = await fetch(`/api/restaurants?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`).then(r => r.json());
  const box = document.getElementById('restaurants-box');
  if (!data.restaurants?.length) { box.textContent = data.message || 'No open restaurants'; return; }
  box.innerHTML = data.restaurants.map(r =>
    `<div class="item-line"><span>${r.name}<br><span class="meta">${r.area} · ${r.eta || 'open'}</span></span><button data-id="${r.id}" data-name="${r.name}">Menu</button></div>`
  ).join('');
  box.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => loadMenu(btn.dataset.id, btn.dataset.name)));
});

async function loadMenu(id, name) {
  currentRestaurant = { id, name };
  const data = await post('/api/menu', { phone: getPhone(), restaurantId: id });
  const box = document.getElementById('menu-box');
  if (!data.items?.length) { box.textContent = data.message || 'Menu empty'; return; }
  box.innerHTML = `<div><strong>${name}</strong></div>` + data.items.map(i =>
    `<div class="item-line"><span>${i.name}<br><span class="meta">₹${i.price}</span></span><button data-item="${i.id}" data-name="${i.name}" data-price="${i.price}">Add</button></div>`
  ).join('');
  box.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => addItem(btn.dataset.item, btn.dataset.name, btn.dataset.price)));
}

async function addItem(itemId, name, price) {
  const data = await post('/api/cart/add', { phone: getPhone(), restaurantId: currentRestaurant.id, itemId, name, price, quantity: 1 });
  renderCart(data.cartState);
}

function renderCart(cart) {
  const box = document.getElementById('live-cart-box');
  if (!cart) return;
  const items = cart.items || [];
  box.innerHTML = `<div><strong>${cart.restaurantName || currentRestaurant?.name || 'Cart'}</strong></div>` +
    (items.length ? items.map(i => `<div class="item-line"><span>${i.name} x${i.quantity}</span><span>₹${i.total}</span></div>`).join('') : '<div class="meta">Empty</div>') +
    `<div class="meta">Subtotal ₹${cart.totalAmount || 0}</div>`;
}

on('btn-coupons', async () => {
  const data = await post('/api/coupon/list', { phone: getPhone() });
  const box = document.getElementById('coupon-box');
  if (!data.coupons?.length) { box.textContent = 'No coupons on this account.'; return; }
  box.innerHTML = data.coupons.map(c => `<button data-code="${c.code}">${c.code}</button>`).join(' ');
  box.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => applyCode(btn.dataset.code)));
});

document.getElementById('btn-best').addEventListener('click', () => applyCode('BEST'));

async function applyCode(code) {
  const data = await post('/api/coupon/apply', { phone: getPhone(), code });
  document.getElementById('amount-box').textContent = data.ok
    ? `Coupon ${data.couponCode} · discount ₹${data.discount} · final ₹${data.finalAmount}`
    : (data.error || 'Coupon failed');
}

document.getElementById('btn-pay').addEventListener('click', async () => {
  const data = await post('/api/pay', { phone: getPhone() });
  const box = document.getElementById('qr-box');
  if (!data.ok) { box.textContent = data.error || data.message || 'Pay failed'; return; }
  box.innerHTML = data.qrUrl
    ? `<div>Scan UPI</div><img class="qr" src="${data.qrUrl}" alt="UPI QR" /><div class="meta">${data.orderId || ''}</div>`
    : 'Order placed. No UPI QR returned — check payment status.';
  startLiveSync(getPhone());
});

function renderLiveState(payload) {
  if (!payload?.ok) return;
  if (payload.deviceId) document.getElementById('active-device-id').textContent = payload.deviceId;
  if (payload.cartState) renderCart(payload.cartState);
  const pay = document.getElementById('live-payment-box');
  if (pay && payload.paymentState) {
    const p = payload.paymentState;
    pay.innerHTML = `<div>Order: <strong>${p.orderId || '-'}</strong></div><div>Status: ${p.status || '-'}</div><div>ETA: ${p.eta || '-'}</div><div>Rider: ${p.rider || '-'}</div>`;
    const link = document.getElementById('track-link');
    if (link && p.orderId) link.innerHTML = `<a href="https://www.swiggy.com/order-track/${p.orderId}" target="_blank">Open tracking link</a>`;
  }
}

function startLiveSync(phone) {
  if (liveSource) liveSource.close();
  setSyncStatus('Live');
  liveSource = new EventSource(`/api/live/${phone}`);
  liveSource.onmessage = (e) => {
    try { renderLiveState(JSON.parse(e.data)); } catch (_) {}
  };
}

on('btn-manual-payment', async () => {
  const data = await post('/api/payment/sync', { phone: getPhone() });
  renderLiveState({ ok: true, paymentState: data.paymentState });
});
