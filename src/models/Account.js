const crypto = require('crypto');
const { getMode } = require('../config/db');

const ANDROID_MODELS = [
  { build: 'SM-S918B; Build/TP1A.220624.014', ua: 'Swiggy-Android/4.52.0 (SM-S918B; Android 13; SDK 33)' },
  { build: 'Pixel 7 Pro; Build/TQ3A.230805.001', ua: 'Swiggy-Android/4.52.0 (Pixel 7 Pro; Android 13; SDK 33)' },
  { build: 'OnePlus 11 5G; Build/SKQ1.221119.001', ua: 'Swiggy-Android/4.52.0 (CPH2447; Android 13; SDK 33)' },
  { build: '2210132G; Build/TKQ1.220829.002', ua: 'Swiggy-Android/4.52.0 (2210132G; Android 13; SDK 33)' },
  { build: 'SM-A546E; Build/TP1A.220624.014', ua: 'Swiggy-Android/4.52.0 (SM-A546E; Android 13; SDK 33)' },
  { build: 'SM-G998B; Build/SP1A.210812.016', ua: 'Swiggy-Android/4.52.0 (SM-G998B; Android 12; SDK 31)' },
  { build: 'Pixel 6; Build/SP2A.220505.008', ua: 'Swiggy-Android/4.52.0 (Pixel 6; Android 12; SDK 31)' }
];

function generateDeviceFingerprint() {
  const model = ANDROID_MODELS[Math.floor(Math.random() * ANDROID_MODELS.length)];
  return {
    deviceId: crypto.randomUUID(),
    swuid: crypto.randomBytes(8).toString('hex'),
    userAgent: model.ua,
    deviceModel: model.build
  };
}

function blankState() {
  return {
    name: '',
    email: '',
    tid: '',
    sid: '',
    csrfToken: '',
    cookies: {},
    isLoggedIn: false,
    lat: '13.0827',
    lng: '80.2707',
    proxy: '',
    accessKey: '',
    cartState: { cartId: '', items: [], totalAmount: 0, restaurantName: '', updatedAt: null },
    addressState: { addresses: [], defaultAddressId: '', updatedAt: null },
    paymentState: { orderId: '', transactionId: '', status: 'IDLE', paymentMethod: '', amount: 0, upiIntentUrl: '', eta: '', rider: '', updatedAt: null },
    claimState: { offers: [], claimed: [], updatedAt: null }
  };
}

const memory = new Map();
const keyIndex = new Map();

function makeAccessKey() {
  const digits = () => String(Math.floor(1000 + Math.random() * 9000));
  const letters = () => Array.from({ length: 4 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]).join('');
  const mix = () => Array.from({ length: 4 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
  return `${digits()}-${letters()}-${mix()}`;
}

function bindKey(acc) {
  if (!acc.accessKey) acc.accessKey = makeAccessKey();
  keyIndex.set(String(acc.accessKey).toUpperCase(), acc.phone);
  return acc.accessKey;
}

function attachMethods(acc) {
  acc.rotateDevice = function () {
    const fp = generateDeviceFingerprint();
    this.deviceId = fp.deviceId;
    this.swuid = fp.swuid;
    this.userAgent = fp.userAgent;
    this.deviceModel = fp.deviceModel;
    this.tid = '';
    this.sid = '';
    this.csrfToken = '';
    this.cookies = {};
    this.isLoggedIn = false;
    return this;
  };
  acc.save = async function () {
    this.updatedAt = new Date();
    memory.set(this.phone, this);
    return this;
  };
  acc.markModified = function () { return this; };
  return acc;
}

function memoryCreate(data) {
  const now = new Date();
  const acc = attachMethods({
    ...blankState(),
    ...generateDeviceFingerprint(),
    ...data,
    createdAt: now,
    updatedAt: now
  });
  memory.set(acc.phone, acc);
  bindKey(acc);
  return acc;
}

const MemoryAccount = {
  generateFingerprint: generateDeviceFingerprint,
  makeAccessKey,
  async findByKey(key) {
    const phone = keyIndex.get(String(key || '').toUpperCase());
    if (!phone) return null;
    return memory.get(phone) || null;
  },
  async findOne(query) {
    if (!query || !query.phone) return null;
    return memory.get(String(query.phone)) || null;
  },
  async create(data) {
    return memoryCreate(data);
  },
  find() {
    const rows = Array.from(memory.values());
    return {
      sort() {
        return rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      }
    };
  }
};

let MongooseAccount = null;
function mongoModel() {
  if (MongooseAccount) return MongooseAccount;
  const mongoose = require('mongoose');
  const schema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    deviceId: { type: String, required: true },
    swuid: { type: String, required: true },
    userAgent: { type: String, required: true },
    deviceModel: { type: String, default: '' },
    tid: { type: String, default: '' },
    sid: { type: String, default: '' },
    csrfToken: { type: String, default: '' },
    cookies: { type: Object, default: {} },
    isLoggedIn: { type: Boolean, default: false },
    lat: { type: String, default: '13.0827' },
    lng: { type: String, default: '80.2707' },
    proxy: { type: String, default: '' },
    cartState: { type: Object, default: () => blankState().cartState },
    addressState: { type: Object, default: () => blankState().addressState },
    paymentState: { type: Object, default: () => blankState().paymentState },
    claimState: { type: Object, default: () => blankState().claimState }
  }, { timestamps: true });
  schema.statics.generateFingerprint = generateDeviceFingerprint;
  schema.methods.rotateDevice = function () {
    const fp = generateDeviceFingerprint();
    this.deviceId = fp.deviceId;
    this.swuid = fp.swuid;
    this.userAgent = fp.userAgent;
    this.deviceModel = fp.deviceModel;
    this.tid = '';
    this.sid = '';
    this.csrfToken = '';
    this.cookies = {};
    this.isLoggedIn = false;
    return this;
  };
  MongooseAccount = mongoose.models.Account || mongoose.model('Account', schema);
  MongooseAccount.generateFingerprint = generateDeviceFingerprint;
  return MongooseAccount;
}

function active() {
  return getMode() === 'mongo' ? mongoModel() : MemoryAccount;
}

module.exports = {
  generateFingerprint: generateDeviceFingerprint,
  makeAccessKey,
  findByKey: (...args) => active().findByKey ? active().findByKey(...args) : MemoryAccount.findByKey(...args),
  findOne: (...args) => active().findOne(...args),
  create: (...args) => active().create(...args),
  find: (...args) => active().find(...args)
};
