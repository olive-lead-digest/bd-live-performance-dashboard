const fs = require('fs');
const path = require('path');

const CITIES = [
  { name: 'Bangalore', state: 'KA', region: 'South' },
  { name: 'Bengaluru', state: 'KA', region: 'South' },
  { name: 'Mumbai', state: 'MH', region: 'West' },
  { name: 'Delhi', state: 'DL', region: 'North' },
  { name: 'New Delhi', state: 'DL', region: 'North' },
  { name: 'Pune', state: 'MH', region: 'West' },
  { name: 'Hyderabad', state: 'TG', region: 'South' },
  { name: 'Chennai', state: 'TN', region: 'South' },
  { name: 'Kolkata', state: 'WB', region: 'East' },
  { name: 'Ahmedabad', state: 'GJ', region: 'West' },
  { name: 'Jaipur', state: 'RJ', region: 'North' },
  { name: 'Goa', state: 'GA', region: 'West' },
  { name: 'Gurgaon', state: 'HR', region: 'North' },
  { name: 'Noida', state: 'UP', region: 'North' },
  { name: 'Kochi', state: 'KL', region: 'South' },
  { name: 'Chandigarh', state: 'CH', region: 'North' },
  { name: 'Indore', state: 'MP', region: 'Central' },
  { name: 'Yelagiri Hills', state: 'TN', region: 'South' },
  { name: 'Ooty', state: 'TN', region: 'South' },
  { name: 'Munnar', state: 'KL', region: 'South' }
];

const BRANDS = ['Olive', 'Spark', 'Open Hotels'];
const STATUSES = ['New Leads', 'Lead Contacted', 'Under Discussion', 'Site Visit Done', 'Site Visit Planned', 'Closure', 'Lead Dropped', null];
const TIERS = ['Tier 1', 'Tier 2', 'Tier 3', 'Unknown'];
const OWNERS = [
  'Sawan Bhatt', 'Ashish Varma', 'Haresh Kumar', 'Ankur Pateriya', 
  'Inderjeet Ahlawat', 'Shreedhar Ambalajari', 'Mohd Zaib', 'Satya Mohanty', 
  'Shiva Srivastava', 'Aromal Babu', 'Akhil B Chandran', 'Amrit Mishra',
  'Krishna Kumar (Nakkani)', 'Tabrez Anwar', 'Syed Mazher Shah', 'Ajith KS',
  'Vaishnava Jyothi A', 'Prasoon Singh', 'Gourang Patil', 'Sukhpreet Singh Lohia'
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

const leads = [];
const END_DATE = new Date();
const START_DATE = new Date();
START_DATE.setDate(START_DATE.getDate() - 90); // Last 90 days

for (let i = 0; i < 15000; i++) { // Generate 15k leads for high volume simulation
  const city = randomChoice(CITIES);
  const brand = randomChoice(BRANDS);
  const status = randomChoice(STATUSES);
  // Roughly 80% have an owner
  const owner = Math.random() > 0.2 ? randomChoice(OWNERS) : null;
  const date = randomDate(START_DATE, END_DATE);
  
  // Format date as YYYY-MM-DD
  const dt = date.toISOString().split('T')[0];

  leads.push({
    dt,
    state: city.state,
    region: city.region,
    city: city.name,
    brand,
    owner,
    status,
    prop: `Prop ${Math.floor(Math.random() * 1000)}`,
    tier: randomChoice(TIERS),
    cluster: city.name + ' Cluster',
    ci: Math.random() > 0.8
  });
}

// BPS / Performance mock data
const bds = {};
OWNERS.forEach(owner => {
  bds[owner] = {
    owner,
    role: 'BD',
    band: randomChoice(['L1', 'L2', 'L3']),
    zoom: {
      out: Math.floor(Math.random() * 500) + 100,
      conn: Math.floor(Math.random() * 200) + 50,
      rec: Math.floor(Math.random() * 50) + 10
    },
    q: {
      overall: Math.random() * 4 + 6, // 6 to 10
      soft_skills: Math.random() * 4 + 6,
      brand_alignment: Math.random() * 4 + 6,
      pitch_clarity: Math.random() * 4 + 6,
      sales_skill: Math.random() * 4 + 6,
      conversion_skill: Math.random() * 4 + 6,
      discovery_quality: Math.random() * 4 + 6,
      objection_handling: Math.random() * 4 + 6,
      closing_discipline: Math.random() * 4 + 6
    },
    strength: randomChoice(['Excellent objection handling', 'Strong pipeline conversion', 'High volume outreach', 'Great brand alignment']),
    risk: randomChoice(['Monitor pacing', 'Low connect rate', 'Needs coaching on closing', 'Inconsistent follow-ups'])
  };
});

const DASH_DATA = {
  generated: new Date().toISOString().replace('T', ' ').substring(0, 16),
  weights: { Q: 0.25, Cv: 0.25, Cmp: 0.15, Lv: 0.15, Cav: 0.2 },
  dims: ["soft_skills", "brand_alignment", "pitch_clarity", "sales_skill", "conversion_skill", "discovery_quality", "objection_handling", "closing_discipline", "overall"],
  leads,
  bds,
  weights_used: { Q: 1, Cv: 1, Cmp: 1, Lv: 1, Cav: 1 } // To pass simple multiplier in Context
};

const outputContent = "window.DASH_DATA=" + JSON.stringify(DASH_DATA) + ";";

fs.writeFileSync(path.join(__dirname, 'public', 'dashboard_data.js'), outputContent);
console.log('Successfully generated public/dashboard_data.js with 15000 rich mock leads.');
