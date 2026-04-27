const MASTER_TALUKS = {
  "Bagalkot": ["Bagalkote", "Jamkhandi", "Mudhola", "Badami", "Bilagi", "Hunagunda", "Ilkal", "Rabkavi Banhatti", "Guledgudda"],
  "Ballari": ["Ballari", "Kurugodu", "Kampli", "Sanduru", "Siraguppa"],
  "Belagavi": ["Belagavi", "Athani", "Bailhongal", "Chikkodi", "Gokak", "Khanapura", "Mudalgi", "Nippani", "Rayabaga", "Savadatti", "Ramadurga", "Kagawada", "Hukkeri", "Kitturu", "Yargatti"],
  "Bengaluru Urban": ["Bengaluru", "Kengeri", "Krishnarajapura", "Anekal", "Yelahanka"],
  "Bengaluru Rural": ["Nelamangala", "Doddaballapura", "Devanahalli", "Hosakote"],
  "Bidar": ["Aurad", "Basavakalyana", "Bhalki", "Bidar", "Chitgoppa", "Hulsuru", "Humnabad", "Kamalanagara"],
  "Chamarajanagar": ["Chamarajanagara", "Gundlupete", "Kollegala", "Yelanduru", "Hanuru"],
  "Chikkaballapura": ["Chikkaballapura", "Bagepalli", "Chintamani", "Gauribidanuru", "Gudibanda", "Sidlaghatta", "Cheluru", "Manchenahalli"],
  "Chikkamagaluru": ["Chikkamagaluru", "Kaduru", "Koppa", "Mudigere", "Narasimharajapura", "Sringeri", "Tarikere", "Ajjampura", "Kalasa"],
  "Chitradurga": ["Chitradurga", "Challakere", "Hiriyur", "Holalkere", "Hosadurga", "Molakalmuru"],
  "Dakshina Kannada": ["Mangaluru", "Ullal", "Mulki", "Moodbidri", "Bantwala", "Belathangadi", "Putturu", "Sulya", "Kadaba"],
  "Davanagere": ["Davanagere", "Harihara", "Channagiri", "Honnali", "Nyamathi", "Jagaluru"],
  "Dharwad": ["Kalghatgi", "Dharwad", "Hubballi (Rural)", "Hubballi (Urban)", "Kundagolu", "Navalgunda", "Alnavara", "Annigeri"],
  "Gadag": ["Gadag", "Naragunda", "Mundaragi", "Rona", "Gajendragada", "Lakshmeshwara", "Shirahatti"],
  "Hassan": ["Hassan", "Arasikere", "Channarayapattana", "Holenarsipura", "Sakleshpura", "Aluru", "Arakalagudu", "Beluru"],
  "Haveri": ["Ranibennur", "Byadgi", "Hangala", "Haveri", "Savanuru", "Hirekeruru", "Shiggavi", "Rattihalli"],
  "Kalaburagi": ["Kalaburagi", "Afzalpura", "Alanda", "Chincholi", "Chitapura", "Jevargi", "Sedam", "Kamalapura", "Shahabad", "Kalgi", "Yedrami"],
  "Kodagu": ["Madikeri", "Somawarapete", "Virajapete", "Ponnammapete", "Kushalnagara"],
  "Kolar": ["Kolar", "Bangarapete", "Maluru", "Mulabagilu", "Srinivasapura", "Kolar Gold Fields (Robertsonpete)"],
  "Koppal": ["Koppala", "Gangavathi", "Kushtagi", "Yelaburga", "Kanakagiri", "Karatagi", "Kukanuru"],
  "Mandya": ["Mandya", "Madduru", "Malavalli", "Srirangapattana", "Krishnarajapete", "Nagamangala", "Pandavapura"],
  "Mysuru": ["Mysuru", "Hunasuru", "Krishnarajanagara", "Nanjanagodu", "Heggadadevanakote", "Piriyapattana", "Tirumakudalu Narasipura", "Saraguru", "Saligrama"],
  "Raichur": ["Raichuru", "Sindhanuru", "Manvi", "Devadurga", "Lingasaguru", "Mudgal", "Maski", "Sirawara"],
  "Ramanagara": ["Ramanagara", "Magadi", "Kanakapura", "Channapattana", "Harohalli"],
  "Shivamogga": ["Shivamogga", "Sagara", "Bhadravathi", "Hosanagara", "Shikaripura", "Soraba", "Tirthahalli"],
  "Tumakuru": ["Tumakuru", "Chikkanayakanahalli", "Kunigal", "Madhugiri", "Sira", "Tipturu", "Gubbi", "Koratagere", "Pavagada", "Turuvekere"],
  "Udupi": ["Udupi", "Kapu", "Bynduru", "Karkala", "Kundapura", "Hebri", "Brahmavara"],
  "Uttara Kannada": ["Karwara", "Sirsi", "Joida", "Dandeli", "Bhatkal", "Kumta", "Ankola", "Haliyal", "Honnavara", "Mundagodu", "Siddapura", "Yellapura"],
  "Vijayapura": ["Vijayapura", "Indi", "Basavana Bagewadi", "Sindgi", "Muddebihala", "Talikote", "Devara Hipparagi", "Chadchana", "Tikote", "Babaleshwara", "Kolhara", "Nidagundi", "Alamela"],
  "Yadgir": ["Yadagiri", "Shahapura", "Surapura", "Gurmitkala", "Vadagera", "Hunsagi"],
  "Vijayanagar": ["Hosapete", "Hagaribommanahalli", "Harapanahalli", "Hoovina Hadagali", "Kudligi", "Kotturu"]
};

const DISTRICT_ALIASES = {
  bagalkote: "Bagalkot",
  chamarajanagara: "Chamarajanagar",
  chikkmagaluru: "Chikkamagaluru",
  koppala: "Koppal",
  raichuru: "Raichur",
  yadagiri: "Yadgir",
  vijayanagara: "Vijayanagar"
};

const TALUK_ALIASES = {
  bagalkot: "Bagalkote",
  mudhol: "Mudhola",
  siruguppa: "Siraguppa",
  chamarajanagar: "Chamarajanagara",
  gauribidanur: "Gauribidanuru",
  kadur: "Kaduru",
  belthangady: "Belathangadi",
  belthangadi: "Belathangadi",
  puttur: "Putturu",
  davangere: "Davanagere",
  hubli: "Hubballi (Urban)",
  hubballi: "Hubballi (Urban)",
  kundgol: "Kundagolu",
  navalagunda: "Navalgunda",
  narsingpur: "Narasimharajapura",
  alur: "Aluru",
  belur: "Beluru",
  ranebennur: "Ranibennur",
  byadagi: "Byadgi",
  hangal: "Hangala",
  savanur: "Savanuru",
  hirekerur: "Hirekeruru",
  afzalpur: "Afzalpura",
  chitapur: "Chitapura",
  koppal: "Koppala",
  maddur: "Madduru",
  srirangapatna: "Srirangapattana",
  krishnarajpet: "Krishnarajapete",
  mysore: "Mysuru",
  hunasur: "Hunasuru",
  hunsur: "Hunasuru",
  krishnarajanagar: "Krishnarajanagara",
  nanjangud: "Nanjanagodu",
  "h d kote": "Heggadadevanakote",
  "hd kote": "Heggadadevanakote",
  "h d kot": "Heggadadevanakote",
  piriyapatna: "Piriyapattana",
  "t narasipura": "Tirumakudalu Narasipura",
  "tirumakudalu narasipura": "Tirumakudalu Narasipura",
  raichur: "Raichuru",
  sindhanur: "Sindhanuru",
  lingasugur: "Lingasaguru",
  sirwar: "Sirawara",
  channapatna: "Channapattana",
  bhadravati: "Bhadravathi",
  shikarpura: "Shikaripura",
  thirthahalli: "Tirthahalli",
  tumkur: "Tumakuru",
  tiptur: "Tipturu",
  byndoor: "Bynduru",
  kundapur: "Kundapura",
  brahmavar: "Brahmavara",
  karwar: "Karwara",
  honnavar: "Honnavara",
  mundgod: "Mundagodu",
  yellapur: "Yellapura",
  "basavana bagevadi": "Basavana Bagewadi",
  muddebihal: "Muddebihala",
  talikoti: "Talikote",
  babaleshwar: "Babaleshwara",
  nidagundi: "Nidagundi",
  yadgir: "Yadagiri",
  shahapur: "Shahapura",
  surpur: "Surapura",
  gurmitkal: "Gurmitkala",
  vadgera: "Vadagera",
  hospet: "Hosapete",
  hadagali: "Hoovina Hadagali",
  "hoovina hadagali": "Hoovina Hadagali"
};

function canonicalDistrict(district) {
  const key = String(district || "").trim().toLowerCase();
  return DISTRICT_ALIASES[key] || String(district || "").trim();
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(taluk|taluka|taluku|tq|dist|district|hobli|village|deputation|present|work)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedTaluk(district, taluk) {
  const canonical = canonicalDistrict(district);
  const taluks = MASTER_TALUKS[canonical] || [];
  const rawKey = normalizeKey(taluk);
  if (!rawKey) return String(taluk || "").trim();

  if (TALUK_ALIASES[rawKey] && taluks.includes(TALUK_ALIASES[rawKey])) {
    return TALUK_ALIASES[rawKey];
  }

  for (const master of taluks) {
    const masterKey = normalizeKey(master);
    if (rawKey === masterKey || rawKey.includes(masterKey) || masterKey.includes(rawKey)) return master;
  }

  return String(taluk || "").trim();
}

function isMasterTaluk(district, taluk) {
  const canonical = canonicalDistrict(district);
  return (MASTER_TALUKS[canonical] || []).includes(taluk);
}

function masterLists(user) {
  if (user && user.role !== "admin") {
    const district = canonicalDistrict(user.district);
    const taluk = normalizedTaluk(district, user.taluk);
    return {
      districts: district ? [district] : [],
      taluks: taluk ? [taluk] : [],
      taluksByDistrict: district ? { [district]: taluk ? [taluk] : [] } : {}
    };
  }

  return {
    districts: Object.keys(MASTER_TALUKS),
    taluks: Object.values(MASTER_TALUKS).flat(),
    taluksByDistrict: MASTER_TALUKS
  };
}

function masterTalukCount(user) {
  if (user && user.role !== "admin") return 1;
  return Object.values(MASTER_TALUKS).reduce((total, taluks) => total + taluks.length, 0);
}

module.exports = {
  MASTER_TALUKS,
  canonicalDistrict,
  isMasterTaluk,
  masterLists,
  masterTalukCount,
  normalizedTaluk,
  normalizeKey
};
