

// Define Default State Structure
const defaultState = { 
    profileName: 'Declan', 
    savings: 0, 
    income: 0, 
    monthlyCash: {}, 
    budgets: {}, 
    expenses: [], 
    holdings: [], 
    investmentHistory: [],
    fundActivities: [],
    netWorthChange: null
  };

let state = JSON.parse(JSON.stringify(defaultState));
const sessionStore = {};

// -----------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------

function storedGet(name) {
  try { 
      return localStorage.getItem(name); 
  } catch(_) { 
      return sessionStore[name] || null; 
  }
}

function storedSet(name, value) {
  try { 
      localStorage.setItem(name, value); 
  } catch(_) { 
      sessionStore[name] = value; 
  }
}

function el(id) { 
  return document.getElementById(id); 
}

function setText(id, value) { 
  const node = el(id); 
  if (node) {
      node.textContent = value; 
  }
}

function isoDay(offset) { 
  const d = new Date(); 
  d.setDate(d.getDate() + offset); 
  return d.toISOString().slice(0, 10); 
}

function isoDateTime() { 
  const d = new Date(); 
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); 
  return d.toISOString().slice(0, 16); 
}

function money(value, currency = 'MYR', compact = false) { 
  const sign = currency === 'MYR' ? 'RM ' : '$'; 
  return sign + new Intl.NumberFormat('en-MY', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
  }).format(value || 0); 
}

function ppuMoney(value, currency = 'MYR') { 
  const sign = currency === 'MYR' ? 'RM ' : '$'; 
  return sign + new Intl.NumberFormat('en-MY', { 
      minimumFractionDigits: 3, 
      maximumFractionDigits: 3 
  }).format(value || 0); 
}

function toMYR(value, currency) { 
  return currency === 'USD' ? (value || 0) * fx : (value || 0); 
}

function formatDate(date, showTime = false) {
  const hasTime = (date || '').includes('T');
  const d = new Date(hasTime ? date : (date || isoDay(0)) + 'T12:00:00');
  let str = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  if (showTime && hasTime) {
      str += ' ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  return str;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>'"]/g, c => ({ 
      '&': '&amp;', 
      '<': '&lt;', 
      '>': '&gt;', 
      "'": '&#39;', 
      '"': '&quot;' 
  }[c]));
}

function iconFor(c) {
  return ({
      Food: '⌁', 
      Transport: '↗', 
      Shopping: '□', 
      Bills: '◌'
  })[c] || '·';
}

function getFilteredExpenses() {
    return [...(state.expenses || [])].filter(x => {
        const matchCat1 = (expenseFilter1 === 'all' || x.category === expenseFilter1);
        const matchCat2 = (expenseFilter2 === 'all' || (x.category2 || 'No') === expenseFilter2);
        
        // Date range filtering
        const itemDate = (x.date || '').slice(0, 10);
        let matchDate = true;
        if (expenseDateFrom && itemDate < expenseDateFrom) matchDate = false;
        if (expenseDateTo && itemDate > expenseDateTo) matchDate = false;

        return matchCat1 && matchCat2 && matchDate;
    });
}

// -----------------------------------------
// AUTH & FIREBASE SYNC
// -----------------------------------------

auth.onAuthStateChanged(user => {
  const loginOverlay = document.getElementById('login-overlay');
  if (user) {
      if (loginOverlay) loginOverlay.style.display = 'none';
      loadCloudState();
  } else {
      if (loginOverlay) loginOverlay.style.display = 'flex';
      state = JSON.parse(JSON.stringify(defaultState));
      renderAll();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
      loginBtn.addEventListener('click', () => {
          const email = document.getElementById('login-email').value;
          const pass = document.getElementById('login-password').value;
          const errorNode = document.getElementById('login-error');
          
          errorNode.style.display = 'none';
          auth.signInWithEmailAndPassword(email, pass).catch(err => {
              errorNode.textContent = err.message;
              errorNode.style.display = 'block';
          });
      });
  }
});

async function loadCloudState() {
  try {
      const snap = await docRef.get();
      if (snap.exists) { 
          const data = snap.data();
          state = { ...defaultState, ...data };
          
          // Crash-Proof Safety Nets (Prevents missing properties from breaking the app)
          if (state.savings === undefined) state.savings = state.cash || 0; 
          if (state.income === undefined) state.income = 0; 
          if (typeof state.monthlyCash !== 'object' || !state.monthlyCash) state.monthlyCash = {}; 
          if (typeof state.budgets !== 'object' || !state.budgets) state.budgets = {}; 
          if (!Array.isArray(state.expenses)) state.expenses = [];
          if (!Array.isArray(state.holdings)) state.holdings = [];
          if (!Array.isArray(state.investmentHistory)) state.investmentHistory = [];
          if (!Array.isArray(state.fundActivities)) state.fundActivities = [];
          if (state.netWorthChange === undefined) state.netWorthChange = null;
      }
      renderAll();
  } catch (err) {
      console.error("Firebase load error:", err);
  }
}

function save() {
    return docRef.set(state).catch(err => {
        console.error("Firebase save error:", err);
        throw err;
    });
  }

// -----------------------------------------
// STATE & DIRECTORIES
// -----------------------------------------

let expenseFilter1 = 'all';
let expenseFilter2 = 'all';
let expenseDateFrom = '';
let expenseDateTo = '';
let expenseSort = { key: 'date', direction: -1 };
let selectedMonth = new Date().toISOString().slice(0, 7);
let holdingSort = { key: 'unrealised', direction: -1 };
let historySort = { key: 'date', direction: -1 };

const fx = 4.35;

const tickerDirectory = [
  {ticker:'0010', name:'IRIS Corporation Berhad', market:'MYR'}, 
  {ticker:'5109', name:'YTL Hospitality REIT', market:'MYR'},
  {ticker:'5176', name:'Sunway Real Estate Investment Trust (SUNREIT)', market:'MYR'}, 
  {ticker:'5227', name:'IGB Real Estate Investment Trust (IGBREIT)', market:'MYR'},
  {ticker:'5555', name:'Sunway Healthcare Holdings (SunMed)', market:'MYR'}, 
  {ticker:'1155', name:'Malayan Banking Berhad (Maybank)', market:'MYR'}, 
  {ticker:'1023', name:'CIMB Group Holdings', market:'MYR'}, 
  {ticker:'5347', name:'Tenaga Nasional Berhad', market:'MYR'}, 
  {ticker:'5183', name:'Petronas Chemicals Group', market:'MYR'}, 
  {ticker:'AAPL', name:'Apple Inc.', market:'US'}, 
  {ticker:'MSFT', name:'Microsoft Corporation', market:'US'}, 
  {ticker:'NVDA', name:'NVIDIA Corporation', market:'US'}, 
  {ticker:'TSLA', name:'Tesla, Inc.', market:'US'}, 
  {ticker:'GOOGL', name:'Alphabet Inc.', market:'US'},
  {ticker:'QQQ', name:'Invesco QQQ Trust', market:'US'}, 
  {ticker:'QQQM', name:'Invesco NASDAQ 100 ETF', market:'US'}, 
  {ticker:'VOO', name:'Vanguard S&P 500 ETF', market:'US'}, 
  {ticker:'1295', name:'Public Bank Berhad', market:'MYR'},
  {ticker:'1066', name:'RHB Bank Berhad', market:'MYR'},
  {ticker:'5819', name:'Hong Leong Bank Berhad', market:'MYR'},
  {ticker:'1082', name:'Hong Leong Financial Group', market:'MYR'},
  {ticker:'8869', name:'Press Metal Aluminium Holdings', market:'MYR'},
  {ticker:'5211', name:'Sunway Berhad', market:'MYR'},
  {ticker:'4197', name:'Sime Darby Berhad', market:'MYR'},
  {ticker:'5284', name:'MR D.I.Y. Group', market:'MYR'},
  {ticker:'5326', name:'99 Speed Mart Retail Holdings', market:'MYR'},
  {ticker:'1961', name:'IOI Corporation Berhad', market:'MYR'},
  {ticker:'5249', name:'IOI Properties Group', market:'MYR'},
  {ticker:'4707', name:'Nestlé (Malaysia) Berhad', market:'MYR'},
  {ticker:'3816', name:'MISC Berhad', market:'MYR'},
  {ticker:'6033', name:'PETRONAS Gas Berhad', market:'MYR'},
  {ticker:'6947', name:'CelcomDigi Berhad', market:'MYR'},
  {ticker:'5168', name:'Top Glove Corporation', market:'MYR'},
  {ticker:'4715', name:'Genting Malaysia Berhad', market:'MYR'},
  {ticker:'3182', name:'Genting Berhad', market:'MYR'}
];

const defaultCategories = [
    'Food', 
    'Car', 
    'Dessert', 
    'Entertainment', 
    'Tolls', 
    'Gift',  
    'Utilities', 
    'Rental',
    'Others'
  ];

// -----------------------------------------
// FINANCIAL MATH ENGINE
// -----------------------------------------

function allTimeExpenses() { 
  return (state.expenses || []).reduce((sum, x) => sum + toMYR(x.amount, x.currency), 0); 
}

function currentExpenses() { 
  return (state.expenses || []).filter(x => (x.date || '').startsWith(selectedMonth)); 
}

function totalExpenses() { 
  return currentExpenses().reduce((sum, x) => sum + toMYR(x.amount, x.currency), 0); 
}

function holdingValue(h) { 
  return toMYR(h.shares * (h.price || h.ppu), h.currency); 
}

function investmentTotal() { 
  const holdingsValue = (state.holdings || []).reduce((sum, h) => sum + holdingValue(h), 0); 
  const dividendsValue = (state.investmentHistory || [])
      .filter(item => item.type === 'DIVIDEND')
      .reduce((sum, item) => sum + toMYR(item.amount, item.currency), 0);
  return holdingsValue + dividendsValue;
}

function globalAvailableCash() {
  const totalInvCost = (state.holdings || []).reduce((sum, h) => sum + toMYR(h.shares * h.cost, h.currency), 0);
  return Number(state.savings || 0) + Number(state.income || 0) - totalInvCost - allTimeExpenses();
}

function monthlyAvailableCash() { 
  return ((state.monthlyCash || {})[selectedMonth] || 0) - totalExpenses(); 
}

function netWorth() { 
  return globalAvailableCash() + investmentTotal(); 
}

function categories() { 
  return currentExpenses().reduce((map, x) => { 
      const cat = x.category || 'Uncategorized';
      map[cat] = (map[cat] || 0) + toMYR(x.amount, x.currency); 
      return map; 
  }, {}); 
}

// -----------------------------------------
// RENDERERS
// -----------------------------------------

function renderProfile() {
  const name = state.profileName || 'Declan';
  const initial = name.charAt(0).toUpperCase();
  const user = auth.currentUser;
  
  setText('greet-name', name);
  setText('profile-name-display', name);
  setText('avatar-icon', initial);
  if (user) {
      setText('profile-email-display', user.email);
  }
}

function renderDashboard() {
  const spent = totalExpenses();
  const investments = investmentTotal();
  const total = netWorth();
  
  setText('total-worth', money(total, 'MYR', true)); 
  setText('month-spent', money(spent, 'MYR', true));
  setText('investment-value', money(investments, 'MYR', true)); 
  setText('spent-note', `${currentExpenses().length} transactions this month`);
  setText('investment-change', (state.holdings || []).length ? `${state.holdings.length} active positions` : 'Add your first holding');
  
  const totalInvCost = (state.holdings || []).reduce((sum, h) => sum + toMYR(h.shares * h.cost, h.currency), 0);
  const roiNode = el('investment-roi');
  if (roiNode) {
      if (totalInvCost > 0) {
          const roiPercent = ((investments - totalInvCost) / totalInvCost) * 100;
          roiNode.textContent = `${roiPercent >= 0 ? '↑' : '↓'} ${Math.abs(roiPercent).toFixed(2)}%`;
          roiNode.className = `trend ${roiPercent >= 0 ? 'positive' : 'negative'}`;
          roiNode.style.display = 'inline-block';
      } else { 
          roiNode.style.display = 'none'; 
      }
  }

  const weeks = [0, 0, 0, 0]; 
  currentExpenses().forEach(x => { 
      const dateObj = new Date(x.date || Date.now());
      const i = Math.min(3, Math.floor((dateObj.getDate() - 1) / 7)); 
      weeks[i] += toMYR(x.amount, x.currency); 
  });
  
  const max = Math.max(...weeks, 100); 
  if (el('bar-chart')) {
      el('bar-chart').innerHTML = weeks.map((value, index) => `
          <div class="bar-group" data-week="Week ${index + 1}" data-amount="${money(value)}" style="cursor: pointer;">
              <i class="bar" style="height:${Math.max(4, value / max * 100)}%"></i>
              <i class="bar secondary" style="height:${Math.max(3, (value * 0.48) / max * 100)}%"></i>
          </div>
      `).join('');

      // Dynamic hover listener to show the amount instantly in the header
      const hoverDisplay = el('chart-hover-display');
      if (hoverDisplay) {
          document.querySelectorAll('.bar-group').forEach(group => {
              group.onmouseenter = () => {
                  hoverDisplay.textContent = `${group.dataset.week}: ${group.dataset.amount}`;
                  hoverDisplay.style.color = 'var(--ink)';
              };
              group.onmouseleave = () => {
                  hoverDisplay.textContent = '';
              };
          });
      }
  }

  const byCat = categories(); 
  if (el('budget-list')) {
      el('budget-list').innerHTML = Object.entries(state.budgets || {}).map(([name, limit]) => { 
          const used = byCat[name] || 0; 
          const percent = Math.min(100, (used / limit) * 100); 
          return `
              <div class="budget-row">
                  <b>${escapeHtml(name)}</b>
                  <div class="budget-meter"><i style="width:${percent}%"></i></div>
                  <span>${money(used, 'MYR', true)} / ${money(limit, 'MYR', true)}</span>
              </div>
          `; 
      }).join('');
  }
  
  // Dashboard Allowance Pacing Engine
  const allowance = (state.monthlyCash || {})[selectedMonth] || 0;
  const remaining = allowance - spent;
  const allowancePct = allowance > 0 ? Math.min((spent / allowance) * 100, 100) : 0;
  
  if (el('dash-allowance-left')) {
      setText('dash-allowance-left', money(remaining, 'MYR', true));
      const remainingColor = remaining >= 0 ? 'var(--ink)' : 'var(--negative)';
      el('dash-allowance-left').style.setProperty('color', remainingColor, 'important');
      
      if (el('dash-allowance-bar')) {
          el('dash-allowance-bar').style.width = `${allowancePct}%`;
          el('dash-allowance-bar').style.background = allowancePct > 90 ? 'var(--negative)' : 'var(--lime)';
      }
      
      setText('dash-allowance-spent', `Spent: ${money(spent, 'MYR', true)}`);
      
      const today = new Date();
      const selectedDate = new Date(selectedMonth + '-01T12:00:00');
      let daysLeft = 1;
      
      if (today.toISOString().slice(0,7) === selectedMonth) {
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
          daysLeft = lastDay - today.getDate() + 1;
      } else if (today < selectedDate) {
          daysLeft = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
      }
      
      const daily = remaining > 0 ? remaining / daysLeft : 0;
      setText('dash-allowance-daily', daysLeft > 1 ? `Safe to spend: ${money(daily, 'MYR', true)} / day` : 'End of month');
  }
  
  if (el('recent-activity')) {
      const recentActivity = [...(state.expenses || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4);
      el('recent-activity').innerHTML = recentActivity.map(x => `
          <div class="activity-item">
              <div class="activity-icon">${iconFor(x.category)}</div>
              <div>
                  <b>${escapeHtml(x.name)}</b>
                  <small>${escapeHtml(x.category)}${x.category2 === 'Yes' ? ' · Yes' : ''} · ${formatDate(x.date, true)}</small>
              </div>
              <strong>−${money(x.amount, x.currency)}</strong>
              <div class="table-actions">
                  <button data-edit-expense="${x.id}" aria-label="Edit">Edit</button>
                  <button class="delete-btn" data-delete-expense="${x.id}">×</button>
              </div>
          </div>
      `).join('') || '<div class="empty-state">No activity yet.</div>';
  }

  // Dashboard Asset Distribution Donut
  const cashValue = Math.max(0, globalAvailableCash());
  const investValue = investments;
  const totalAssets = cashValue + investValue;

  if (el('dash-asset-donut')) {
      const assetStops = [];
      if (totalAssets > 0) {
          const cashPct = (cashValue / totalAssets) * 100;
          assetStops.push(`#c7ef59 0% ${cashPct}%`);
          assetStops.push(`#7997e8 ${cashPct}% 100%`);
      }
      el('dash-asset-donut').style.background = totalAssets ? `conic-gradient(${assetStops.join(',')})` : '#e8ece7'; 
      setText('dash-asset-total', money(totalAssets, 'MYR', true));
      
      if (el('dash-asset-legend')) {
          el('dash-asset-legend').innerHTML = totalAssets > 0 ? `
              <div class="legend-row"><span><i style="background:#c7ef59"></i>Cash</span><b>${Math.round((cashValue/totalAssets)*100)}%</b></div>
              <div class="legend-row"><span><i style="background:#7997e8"></i>Investments</span><b>${Math.round((investValue/totalAssets)*100)}%</b></div>
          ` : '<span>No assets yet</span>';
      }
  }
}

function renderExpenses() {
  const cats = categories();
  const total = totalExpenses();
  const colors = ['#c7ef59','#f47b54','#7997e8','#9c87db','#e4c35c'];
  
  const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]); 
  let cursor = 0;
  
  const stops = entries.map(([_, value], i) => { 
      const start = cursor; 
      cursor += (value / Math.max(total, 1)) * 100; 
      return `${colors[i % colors.length]} ${start}% ${cursor}%`; 
  });
  
  if (el('donut')) {
      el('donut').style.background = total ? `conic-gradient(${stops.join(',')})` : '#e8ece7'; 
  }
  
  setText('donut-total', money(total, 'MYR', true)); 
  setText('expense-total-label', `${money(total, 'MYR', true)} total`);
  
  if (el('category-legend')) {
      el('category-legend').innerHTML = entries.map(([name, value], i) => `
          <div class="legend-row">
              <span><i style="background:${colors[i % colors.length]}"></i>${escapeHtml(name)}</span>
              <b>${Math.round((value / total) * 100)}%</b>
          </div>
      `).join('') || '<span>No spending yet</span>';
  }
  
  const top3 = entries.slice(0, 3);
  if (top3.length > 0) {
      setText('analysis-title', `${top3[0][0]} is your biggest expense this month.`);
      setText('analysis-copy', `It accounts for ${Math.round((top3[0][1] / total) * 100)}% of your ${money(total, 'MYR', true)} monthly outflow. Review it against your budget to keep your goals on track.`);
      
      if (el('top-category')) {
          el('top-category').innerHTML = top3.map(t => {
              const catName = t[0];
              const spent = t[1];
              const limit = (state.budgets || {})[catName];
              const limitStr = limit ? `<span style="color:var(--muted); opacity:0.8;"> / ${money(limit, 'MYR', true)}</span>` : '';
              const warnColor = limit && spent > limit ? 'color:var(--negative)' : 'color:inherit';
              
              return `
                  <div style="font-size:13px; font-weight:700; margin-bottom:12px; display:flex; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:8px;">
                      <span>${escapeHtml(catName)}</span> 
                      <span style="${warnColor}">${money(spent, 'MYR', true)}${limitStr}</span>
                  </div>
              `;
          }).join('');
      }
  } else {
      setText('analysis-title', 'Start tracking to find your pattern.');
      setText('analysis-copy', 'Add expenses and E-Wallet will surface meaningful changes in your monthly spending.');
      if (el('top-category')) el('top-category').innerHTML = '—';
  }
  
  if (el('recent-expense-rows')) {
      const recent = currentExpenses().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
      el('recent-expense-rows').innerHTML = recent.map(x => `
          <div class="expense-row">
              <div class="expense-name">
                  <b>${escapeHtml(x.name)}</b>
                  <small>${escapeHtml(x.description || x.currency)}</small>
              </div>
              <span class="category-tag">${escapeHtml(x.category)}</span>
              <span class="category-tag" style="${x.category2 === 'Yes' ? 'background:#e8eae5;color:#555' : 'background:transparent;color:var(--muted);border:1px solid var(--line)'}">${x.category2 === 'Yes' ? 'Yes' : 'No'}</span>
              <span>${formatDate(x.date, true)}</span>
              <strong>−${money(x.amount, x.currency)}</strong>
              <div class="table-actions">
                  <button data-edit-expense="${x.id}">Edit</button>
                  <button class="delete-btn" data-delete-expense="${x.id}">×</button>
              </div>
          </div>
      `).join('') || '<div class="empty-state">No matching records this month.</div>';
  }
}

function renderPortfolio() {
  const total = investmentTotal(); 
  setText('portfolio-total', money(total, 'MYR', true)); 
  setText('portfolio-positions', `${(state.holdings || []).length} position${(state.holdings || []).length === 1 ? '' : 's'}`);
  
  const divSum = (state.investmentHistory || []).filter(x => x.type === 'DIVIDEND').reduce((sum, x) => sum + toMYR(x.amount, x.currency), 0);
  const capitalGain = (state.holdings || []).reduce((sum, h) => sum + (holdingValue(h) - toMYR(h.shares * h.cost, h.currency)), 0);
  const totalPL = capitalGain;
  const totalInvCost = (state.holdings || []).reduce((sum, h) => sum + toMYR(h.shares * h.cost, h.currency), 0);
  const plPercent = totalInvCost > 0 ? (totalPL / totalInvCost) * 100 : 0;

  const hasLivePrice = (state.holdings || []).some(h => h.price);

  setText('portfolio-pl', hasLivePrice ? `${totalPL >= 0 ? '↑' : '↓'} ${money(Math.abs(totalPL), 'MYR', true)}` : '—');
  if (el('portfolio-pl')) el('portfolio-pl').className = totalPL >= 0 ? 'positive' : 'negative';

  if (el('portfolio-pl-percent')) {
      el('portfolio-pl-percent').textContent = `${totalPL >= 0 ? '+' : ''}${plPercent.toFixed(2)}%`;
      el('portfolio-pl-percent').className = `pl-badge ${totalPL >= 0 ? 'bg-positive' : 'bg-negative'}`;
      el('portfolio-pl-percent').style.display = hasLivePrice ? 'inline-block' : 'none';
  }

  setText('portfolio-div', `+${money(divSum, 'MYR', true)}`);
  if (el('portfolio-div')) el('portfolio-div').className = 'positive';
  
  if (el('holding-rows')) {
      const ordered = [...(state.holdings || [])].sort((a, b) => { 
          const metric = h => ({
              name: (h.ticker || '').toLowerCase(), 
              shares: h.shares, 
              value: h.shares * (h.price || h.ppu),
              ppu: h.ppu || h.cost, 
              price: h.price || h.cost, 
              unrealised: holdingValue(h) - toMYR(h.shares * h.cost, h.currency),
              fees: h.fees || 0
          })[holdingSort.key] || 0; 
          return metric(a) > metric(b) ? holdingSort.direction : metric(a) < metric(b) ? -holdingSort.direction : 0; 
      });
      
      el('holding-rows').innerHTML = ordered.map(h => {
          const value = holdingValue(h); 
          const totalCostMYR = toMYR(h.shares * h.cost, h.currency); 
          const gain = value - totalCostMYR;
          const totalAmt = h.shares * (h.price || h.ppu); 
          const costBasis = h.shares * (h.ppu || h.cost);
          const currentValue = h.shares * (h.price || h.cost); 
          const percent = costBasis ? ((currentValue - costBasis) / costBasis * 100).toFixed(2) : (0).toFixed(2);
          const totalDiv = (state.investmentHistory || []).filter(item => item.type === 'DIVIDEND' && item.ticker === h.ticker).reduce((sum, item) => sum + item.amount, 0);
          
          return `
              <div class="holding-row">
                  <div class="ticker">
                      <b>${escapeHtml(h.ticker)}</b>
                      <small>${escapeHtml(h.name)}</small>
                  </div>
                  <span>${h.shares}</span>
                  <span>${money(totalAmt, h.currency)}</span>
                  <span>${ppuMoney(h.ppu || h.cost, h.currency)}</span>
                  <span>${ppuMoney(h.price || (h.ppu || h.cost), h.currency)}</span>
                  <div class="pl-cell">
                      <span class="${gain >= 0 ? 'positive' : 'negative'}">${gain >= 0 ? '+' : ''}${money(gain, 'MYR')}</span>
                      <small class="${gain >= 0 ? 'positive' : 'negative'}">${gain >= 0 ? '+' : ''}${percent}%</small>
                  </div>
                  <div class="pl-cell">
                      <span style="color:var(--muted)">—</span>
                      <small class="${totalDiv > 0 ? 'positive' : ''}">${totalDiv > 0 ? '+' : ''}${money(totalDiv, h.currency)}</small>
                  </div>
                  <span>${money(h.fees || 0, h.currency)}</span>
                  <div class="table-actions">
                      <button data-edit-holding="${h.id}">Edit</button>
                      <button class="delete-btn" data-delete-holding="${h.id}">×</button>
                  </div>
              </div>
          `;
      }).join('');
  }
  
  if (el('holdings-empty')) {
      el('holdings-empty').classList.toggle('hidden', (state.holdings || []).length > 0);
  }

  const historyList = [...(state.investmentHistory || [])].sort((a, b) => {
      const val = x => {
          if (historySort.key === 'amount') return toMYR(x.amount, x.currency);
          if (historySort.key === 'fees') return toMYR(x.fees || 0, x.currency);
          return x[historySort.key] || '';
      };
      const vA = val(a), vB = val(b);
      return vA > vB ? historySort.direction : vA < vB ? -historySort.direction : 0;
  });

  if (el('recent-investment-history-rows')) {
      el('recent-investment-history-rows').innerHTML = historyList.slice(0, 5).map(item => `
          <div style="display:grid; grid-template-columns: 1fr 0.8fr 1fr 1.5fr 0.8fr 1fr 90px; align-items:center; padding:11px 0; border-bottom:1px solid var(--line); font-size:11px;">
              <span>${formatDate(item.date)}</span>
              <span><b class="type-badge ${item.type.toLowerCase()}">${item.type}</b></span>
              <b>${escapeHtml(item.ticker)}</b>
              <small style="color:var(--muted);">${escapeHtml(item.details || '—')}</small>
              <span>${item.fees ? money(item.fees, item.currency) : '—'}</span>
              <strong class="${item.type === 'DIVIDEND' ? 'positive' : ''}">${item.type === 'DIVIDEND' ? '+' : ''}${money(item.amount, item.currency)}</strong>
              <div class="table-actions">
                  <button data-edit-history="${item.id}">Edit</button>
                  <button class="delete-btn" data-delete-history="${item.id}">×</button>
              </div>
          </div>
      `).join('');
  }
  
  if (el('recent-investment-history-empty')) {
      el('recent-investment-history-empty').style.display = historyList.length ? 'none' : 'block';
  }
}

function renderWorth() { 
    const totalInvCost = (state.holdings || []).reduce(
        (sum, h) => sum + toMYR(h.shares * h.cost, h.currency),
        0
    );
  
    const globalCash = globalAvailableCash();
    const monthlyCash = monthlyAvailableCash(); 
    const deposited = Number(state.savings || 0) + Number(state.income || 0); 
    const total = netWorth();
    
    setText('net-worth-main', money(total, 'MYR', true)); 
  
    /*
     * NET WORTH CHANGE
     *
     * If the user has manually entered a value,
     * use that value.
     *
     * Otherwise, keep the original automatic calculation.
     */
    const hasManualChange =
        state.netWorthChange !== null &&
        state.netWorthChange !== undefined &&
        Number.isFinite(Number(state.netWorthChange));
  
    const growthAmt = hasManualChange
        ? Number(state.netWorthChange)
        : total - Number(state.savings || 0);
  
    /*
     * Percentage is ALWAYS calculated automatically
     * from the current change amount.
     */
    const growthBase = total - growthAmt;
  
    const growthPct = growthBase !== 0
        ? (growthAmt / growthBase) * 100
        : 0;
  
    const growthColor =
        growthAmt >= 0
            ? '#c7ef59'
            : '#ff7a59';
  
    if (el('net-worth-change-amt')) {
        el('net-worth-change-amt').textContent =
            `${growthAmt >= 0 ? '+' : ''}${money(growthAmt, 'MYR', true)}`;
  
        el('net-worth-change-amt').style.setProperty(
            'color',
            growthColor,
            'important'
        );
    }
  
    if (el('net-worth-change-pct')) {
        el('net-worth-change-pct').textContent =
            `${growthAmt >= 0 ? '↑' : '↓'} ${Math.abs(growthPct).toFixed(2)}%`;
  
        el('net-worth-change-pct').style.setProperty(
            'color',
            growthColor,
            'important'
        );
    }
  
    setText(
        'total-deposited',
        money(deposited, 'MYR', true)
    );
  
    setText(
        'monthly-cash-value',
        money(monthlyCash, 'MYR', true)
    );
  
    setText(
        'asset-investment',
        money(totalInvCost, 'MYR', true)
    );
  
    setText(
        'global-cash-value',
        money(globalCash, 'MYR', true)
    ); 
    
    const baseAllowance =
        (state.monthlyCash || {})[selectedMonth] || 0;
  
    const assets = [
        ['Available Cash', Math.max(0, globalCash), '#c7ef59'], 
        ['Investment Cost', totalInvCost, '#7997e8'],
        ['Monthly Allowance', baseAllowance, '#f47b54']
    ]; 
  
    const base = Math.max(
        Math.max(0, globalCash) +
        totalInvCost +
        baseAllowance,
        1
    ); 
    
    if (el('allocation-bars')) {
        el('allocation-bars').innerHTML =
            assets.map(([n, v, c]) => `
                <div class="allocation-row">
                    <b>${n}</b>
                    <div class="allocation-meter">
                        <i style="width:${(v / base) * 100}%;background:${c}"></i>
                    </div>
                    <span>${money(v, 'MYR', true)}</span>
                </div>
            `).join(''); 
    }
  }

    function renderSavingsActivity() {
        const node = el('savings-activity');
        if (!node) return;

        const activities = [...(state.fundActivities || [])]
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .slice(0, 8);

        node.innerHTML = activities.map(item => {
            const isAdd = item.type === 'ADD_FUNDS';
            const amount = Number(item.amount || 0);

            const title = isAdd
                ? 'Funds added'
                : 'Funds updated';

            const detail = isAdd
                ? `Added ${money(amount, 'MYR')} to your funds`
                : `Updated total funds by ${amount >= 0 ? '+' : '−'}${money(Math.abs(amount), 'MYR')}`;

            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        ${isAdd ? '＋' : '↻'}
                    </div>

                    <div>
                        <b>${title}</b>
                        <small>
                            ${escapeHtml(detail)} · ${formatDate(item.date, true)}
                        </small>
                    </div>

                    <strong class="${amount >= 0 ? 'positive' : 'negative'}">
                        ${amount >= 0 ? '+' : '−'}${money(Math.abs(amount), 'MYR')}
                    </strong>

                    <div class="table-actions">
                        <button data-edit-fund-activity="${item.id}">
                            Edit
                        </button>

                        <button
                            class="delete-btn"
                            data-delete-fund-activity="${item.id}">
                            ×
                        </button>
                    </div>
                </div>
            `;
        }).join('') || `
            <div class="empty-state">
                No fund activity yet.
            </div>
        `;
    }

    function renderAll() {
        renderProfile();
        renderDashboard();
        renderExpenses();
        renderPortfolio();
        renderWorth();
        renderSavingsActivity();
    
        // Keep the global month picker synced with selectedMonth
        const globalMonthInput = el('global-month');
        if (globalMonthInput && globalMonthInput.value !== selectedMonth) {
            globalMonthInput.value = selectedMonth;
        }
      }

// -----------------------------------------
// CSV EXPORT ENGINE
// -----------------------------------------

function exportExpenses() {
    const defaultName = selectedMonth ? selectedMonth.replace('-', '') : 'Expenses';
    const userInput = prompt("Enter a name for your export file (e.g. 202609):", defaultName);
    
    if (userInput === null) return; 

    const cleanName = userInput.trim() !== '' ? userInput.trim() : defaultName;
    const fileName = `${cleanName} Expenses.csv`;

    // Uses the exact same date and category filters currently applied in the view
    const visible = getFilteredExpenses().sort((a, b) => {
        const val = x => expenseSort.key === 'amount' ? toMYR(x.amount, x.currency) : expenseSort.key === 'name' ? (x.name || '').toLowerCase() : (x[expenseSort.key] || '');
        return val(a) > val(b) ? expenseSort.direction : val(a) < val(b) ? -expenseSort.direction : 0;
    });
    
    const rows = [['Date', 'Description', 'Category 1', 'Amount', 'Category 2']];
    const escapeCsv = s => '"' + String(s || '').replace(/"/g, '""') + '"';
    
    visible.forEach(x => { 
        rows.push([ 
            escapeCsv(formatDate(x.date, true)), 
            escapeCsv(x.name), 
            escapeCsv(x.category), 
            Number(x.amount || 0).toFixed(2), 
            escapeCsv(x.category2 === 'Yes' ? 'Yes' : 'No') 
        ]); 
    });
  
    triggerNativeExport(fileName, rows.map(e => e.join(",")).join("\n"));
}

function exportInvestments() {
    // Prompt the user for a custom filename, defaulting to the selected month's fund details
    const defaultName = selectedMonth ? `${selectedMonth.replace('-', '')} Fund Details` : 'Fund Details';
    const userInput = prompt("Enter a name for your export file:", defaultName);
    
    // If the user clicks cancel, abort the export
    if (userInput === null) return; 

    const cleanName = userInput.trim() !== '' ? userInput.trim() : defaultName;
    const fileName = cleanName.toLowerCase().endsWith('.csv') ? cleanName : `${cleanName}.csv`;

    const historyList = [...(state.investmentHistory || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rows = [['Date', 'Type', 'Ticker', 'Details', 'Fees', 'Amount', 'Currency']];
    const escapeCsv = s => `"${String(s || '').replace(/"/g, '""')}"`;
    
    historyList.forEach(x => { 
        rows.push([ 
            escapeCsv(formatDate(x.date)), 
            escapeCsv(x.type), 
            escapeCsv(x.ticker), 
            escapeCsv(x.details), 
            Number(x.fees || 0).toFixed(2), 
            Number(x.amount || 0).toFixed(2), 
            escapeCsv(x.currency) 
        ]); 
    });
    
    triggerNativeExport(fileName, rows.map(e => e.join(",")).join("\n"));
}

function triggerNativeExport(filename, csvData) {
  const payload = JSON.stringify({ filename: filename, data: csvData });
  if (window.ExportBridge) {
      ExportBridge.postMessage(payload);
  } else {
      const blob = new Blob(["\uFEFF" + csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; 
      link.download = filename;
      document.body.appendChild(link); 
      link.click();
      document.body.removeChild(link); 
      URL.revokeObjectURL(url);
  }
}

// -----------------------------------------
// MODAL SYSTEM
// -----------------------------------------

function recalculateHolding(ticker, name, market, currency) {
    ticker = String(ticker || '').trim().toUpperCase();
    if (!ticker) return;
  
    const buys = (state.investmentHistory || []).filter(
        item => item.type === 'BUY' &&
                String(item.ticker || '').toUpperCase() === ticker
    );
  
    if (!buys.length) {
        state.holdings = (state.holdings || []).filter(h => h.ticker !== ticker);
        return;
    }
  
    const totalShares = buys.reduce(
        (sum, item) => sum + Number(item.shares || 0), 0
    );
  
    if (totalShares <= 0) return;
  
    const totalPurchaseValue = buys.reduce(
        (sum, item) =>
            sum + Number(item.shares || 0) * Number(item.ppu || 0),
        0
    );
  
    const totalFees = buys.reduce(
        (sum, item) => sum + Number(item.fees || 0),
        0
    );
  
    const oldHolding = (state.holdings || [])
        .find(h => h.ticker === ticker);
  
    const holding = {
        id: oldHolding ? oldHolding.id : Date.now(),
        ticker,
        name: name || (oldHolding && oldHolding.name) || ticker,
        market: market ||
            (oldHolding && oldHolding.market) ||
            (currency === 'USD' ? 'US' : 'MYR'),
        currency: currency ||
            (oldHolding && oldHolding.currency) ||
            'MYR',
        shares: totalShares,
        ppu: totalPurchaseValue / totalShares,
        fees: totalFees,
        cost: (totalPurchaseValue + totalFees) / totalShares
    };
  
    if (oldHolding && oldHolding.price) {
        holding.price = oldHolding.price;
    }
  
    state.holdings = [
        ...(state.holdings || []).filter(h => h.ticker !== ticker),
        holding
    ];
  }

  function showToast(message, type = 'success') {
    let toast = document.getElementById('app-toast');
  
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
  
        toast.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 10000;
            padding: 13px 18px;
            border-radius: 10px;
            background: var(--ink);
            color: var(--surface);
            font: 700 13px Manrope, sans-serif;
            box-shadow: 0 8px 30px rgba(0,0,0,.16);
            opacity: 0;
            transform: translateY(-8px);
            transition: opacity .2s ease, transform .2s ease;
            pointer-events: none;
        `;
  
        document.body.appendChild(toast);
    }
  
    toast.textContent = message;
  
    toast.style.background =
        type === 'error'
            ? 'var(--negative)'
            : 'var(--ink)';
  
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  
    clearTimeout(window.__toastTimer);
  
    window.__toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
    }, 2200);
  }

function recalculateHoldingWrapper(ticker, name, market, currency) {
  recalculateHolding(ticker, name, market, currency);
}

function showProfileModal() {
  const user = auth.currentUser;
  const email = user ? user.email : 'Not logged in';
  const currentName = state.profileName || 'Declan';

  el('modal').classList.remove('wide-modal');
  el('modal').innerHTML = `
      <form id="entry-form" data-type="profile">
          <h2>Profile Settings</h2>
          <p>Update your display name or log out of your session.</p>
          <div class="form-grid">
              <div class="field full">
                  <label>DISPLAY NAME</label>
                  <input name="profileName" required value="${escapeHtml(currentName)}" />
              </div>
              <div class="field full">
                  <label>ACCOUNT EMAIL</label>
                  <input value="${escapeHtml(email)}" disabled style="background: var(--bg); opacity: 0.7; color: var(--muted);" />
              </div>
          </div>
          <div class="modal-actions" style="justify-content: space-between; margin-top: 25px; display: flex; width: 100%;">
              <button class="cancel" type="button" id="logout-btn" style="color: #d0694e; font-weight: 700; padding: 10px 0;">Log Out</button>
              <div style="display:flex; gap:12px;">
                  <button class="cancel" type="button" data-close>Cancel</button>
                  <button class="primary" type="submit">Save</button>
              </div>
          </div>
      </form>
  `;
  
  el('modal-backdrop').hidden = false;
  el('entry-form').addEventListener('submit', submitForm);
  
  el('logout-btn').addEventListener('click', () => {
      auth.signOut().then(() => { closeModal(); });
  });
}

function showAllExpensesModal() {
    el('modal').classList.add('wide-modal');
    el('modal').innerHTML = `
        <div class="activity-modal">
            <div class="modal-head" style="align-items: flex-start; flex-direction: column; gap: 16px;">
                <div>
                    <h2>All Expenses</h2>
                    <p style="margin: 0;">Filter, sort, and manage all your records.</p>
                </div>
                
                <!-- Filter Controls Header Row -->
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 12px; flex-wrap: wrap;">
                    <!-- Left Controls: Date Range & Category Dropdowns -->
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <input 
                            type="date" 
                            id="expense-date-from" 
                            class="table-filter" 
                            title="From Date" 
                            style="height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 12px; box-sizing: border-box;" 
                        />
                        <span style="color: var(--muted); font-size: 12px; font-weight: 600;">to</span>
                        <input 
                            type="date" 
                            id="expense-date-to" 
                            class="table-filter" 
                            title="To Date" 
                            style="height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 12px; box-sizing: border-box;" 
                        />
                        <select 
                            id="expense-category1" 
                            class="table-filter" 
                            style="height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 12px; cursor: pointer; box-sizing: border-box;"
                        >
                            <option value="all">Category 1 (All)</option>
                        </select>
                        <select 
                            id="expense-category2" 
                            class="table-filter" 
                            style="height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 12px; cursor: pointer; box-sizing: border-box;"
                        >
                            <option value="all">Category 2 (All)</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                        </select>
                    </div>
  
                    <!-- Right Controls: Action Buttons -->
                    <div style="display: flex; gap: 8px; align-items: center; margin-left: auto;">
                        <button 
                            class="table-filter" 
                            id="export-expenses" 
                            style="height: 36px; cursor: pointer; border: 1px solid var(--line); padding: 0 14px; border-radius: 8px; background: var(--surface); color: var(--ink); font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; box-sizing: border-box;"
                        >
                            ↓ Export
                        </button>
                        <button 
                            class="cancel" 
                            type="button" 
                            data-close 
                            style="height: 36px; padding: 0 14px; border-radius: 8px; font-size: 12px; display: inline-flex; align-items: center; box-sizing: border-box;"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
  
            <div class="expense-table" style="margin-top: 20px;">
                <div class="table-head">
                    <button data-expense-sort="name">Description ↕</button>
                    <button data-expense-sort="category">Category 1 ↕</button>
                    <button data-expense-sort="category2">Category 2 ↕</button>
                    <button data-expense-sort="date">Date ↕</button>
                    <button data-expense-sort="amount">Amount ↕</button>
                    <span></span>
                </div>
                <div id="modal-expense-rows" class="activity-scroll" style="max-height: 55vh;"></div>
            </div>
        </div>
    `;
    
    el('modal-backdrop').hidden = false;
    renderModalExpenses();
  }

  function renderModalExpenses() {
    const visible = getFilteredExpenses().sort((a, b) => {
        const val = x => expenseSort.key === 'amount' ? toMYR(x.amount, x.currency) : expenseSort.key === 'name' ? (x.name || '').toLowerCase() : (x[expenseSort.key] || '');
        return val(a) > val(b) ? expenseSort.direction : val(a) < val(b) ? -expenseSort.direction : 0;
    });
    
    if (el('modal-expense-rows')) {
        el('modal-expense-rows').innerHTML = visible.map(x => `
            <div class="expense-row">
                <div class="expense-name">
                    <b>${escapeHtml(x.name)}</b>
                    <small>${escapeHtml(x.description || x.currency)}</small>
                </div>
                <span class="category-tag">${escapeHtml(x.category)}</span>
                <span class="category-tag" style="${x.category2 === 'Yes' ? 'background:#e8eae5;color:#555' : 'background:transparent;color:var(--muted);border:1px solid var(--line)'}">${x.category2 === 'Yes' ? 'Yes' : 'No'}</span>
                <span>${formatDate(x.date, true)}</span>
                <strong>−${money(x.amount, x.currency)}</strong>
                <div class="table-actions">
                    <button data-edit-expense="${x.id}">Edit</button>
                    <button class="delete-btn" data-delete-expense="${x.id}">×</button>
                </div>
            </div>
        `).join('') || '<div class="empty-state">No matching records.</div>';
    }
    
    const categoryOptions = [...new Set((state.expenses || []).map(x => x.category))].sort(); 
    if (el('expense-category1')) { 
        el('expense-category1').innerHTML = `<option value="all">Category 1 (All)</option>${categoryOptions.map(c => `<option value="${escapeHtml(c)}" ${c === expenseFilter1 ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}`; 
    }
    if (el('expense-category2') && el('expense-category2').value !== expenseFilter2) { 
        el('expense-category2').value = expenseFilter2; 
    }
    if (el('expense-date-from') && el('expense-date-from').value !== expenseDateFrom) {
        el('expense-date-from').value = expenseDateFrom;
    }
    if (el('expense-date-to') && el('expense-date-to').value !== expenseDateTo) {
        el('expense-date-to').value = expenseDateTo;
    }
  }

function showAllHistoryModal() {
  el('modal').classList.add('wide-modal');
  el('modal').innerHTML = `
      <div class="activity-modal">
          <div class="modal-head" style="align-items:center;">
              <div>
                  <h2>Fund Details</h2>
                  <p style="margin:0;">All transactions and dividends sorted by date.</p>
              </div>
              <div style="display:flex; gap:10px;">
                  <button class="table-filter" id="modal-add-dividend" style="cursor:pointer; background:var(--muted); color:white; border:none; padding:8px 14px;">+ Dividend</button>
                  <button class="table-filter" id="modal-add-holding" style="cursor:pointer; background:var(--ink); color:white; border:none; padding:8px 14px;">+ Holding</button>
                  <button class="table-filter" id="export-investments" style="cursor:pointer; border:1px solid var(--line); padding:8px 14px;">↓ Export</button>
                  <button class="cancel" type="button" data-close>Close</button>
              </div>
          </div>
          <div class="holdings-table" style="margin-top:20px;">
              <div class="table-head" style="display:grid; grid-template-columns: 1fr 0.8fr 1fr 1.5fr 0.8fr 1fr 90px; font-family:'DM Mono'; font-size:9px; color:#a2aaa4; letter-spacing:.4px; padding:12px 0 10px; border-bottom:1px solid var(--line);">
                  <button data-history-sort="date">DATE ↕</button>
                  <button data-history-sort="type">TYPE ↕</button>
                  <button data-history-sort="ticker">TICKER ↕</button>
                  <button data-history-sort="details">DETAILS ↕</button>
                  <button data-history-sort="fees">FEES ↕</button>
                  <button data-history-sort="amount">AMOUNT ↕</button>
                  <span></span>
              </div>
              <div id="modal-history-rows" class="activity-scroll" style="max-height: 55vh;"></div>
          </div>
      </div>
  `;
  
  el('modal-backdrop').hidden = false;
  renderModalHistory();
}

function renderModalHistory() {
  const historyList = [...(state.investmentHistory || [])].sort((a, b) => {
      const val = x => {
          if (historySort.key === 'amount') return toMYR(x.amount, x.currency);
          if (historySort.key === 'fees') return toMYR(x.fees || 0, x.currency);
          return x[historySort.key] || '';
      };
      const vA = val(a), vB = val(b);
      return vA > vB ? historySort.direction : vA < vB ? -historySort.direction : 0;
  });

  if (el('modal-history-rows')) {
      el('modal-history-rows').innerHTML = historyList.map(item => `
          <div style="display:grid; grid-template-columns: 1fr 0.8fr 1fr 1.5fr 0.8fr 1fr 90px; align-items:center; padding:11px 0; border-bottom:1px solid var(--line); font-size:11px;">
              <span>${formatDate(item.date)}</span>
              <span><b class="type-badge ${item.type.toLowerCase()}">${item.type}</b></span>
              <b>${escapeHtml(item.ticker)}</b>
              <small style="color:var(--muted);">${escapeHtml(item.details || '—')}</small>
              <span>${item.fees ? money(item.fees, item.currency) : '—'}</span>
              <strong class="${item.type === 'DIVIDEND' ? 'positive' : ''}">${item.type === 'DIVIDEND' ? '+' : ''}${money(item.amount, item.currency)}</strong>
              <div class="table-actions">
                  <button data-edit-history="${item.id}">Edit</button>
                  <button class="delete-btn" data-delete-history="${item.id}">×</button>
              </div>
          </div>
      `).join('') || '<div class="empty-state">No fund details yet.</div>';
  }
}

function showModal(type, data = {}) {
    // Combine default categories with any custom ones already saved in state
    const existingCats = (state.expenses || []).map(x => x.category);
    const allCats = [...new Set([...defaultCategories, ...existingCats])].sort();
    const tickerListOptions = (state.holdings || []).map(h => `<option value="${escapeHtml(h.ticker)}">`).join('');
    
    let title = '';
    let copy = '';
    let fields = '';
  
    if (type === 'expense') {
        title = 'Add an expense';
        copy = 'Record the details and E-Wallet will update your monthly overview.';
        fields = `
            <div class="field full"><label>DESCRIPTION</label><input name="name" required placeholder="e.g. Lunch with friends" /></div>
            <div class="field"><label>AMOUNT</label><input name="amount" type="number" min="0.01" step="0.01" required /></div>
            <div class="field"><label>CURRENCY</label><select name="currency"><option>MYR</option><option>USD</option></select></div>
            <div class="field"><label>CATEGORY 1</label>
                <select name="category" required>
                    <option value="" disabled selected>Select category...</option>
                    ${allCats.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('')}
                </select>
            </div>
            <div class="field"><label>CATEGORY 2</label><select name="category2"><option value="No">No</option><option value="Yes">Yes</option></select></div>
            <div class="field"><label>DATE & TIME</label><input name="date" type="datetime-local" value="${isoDateTime()}" required /></div>
            <div class="field full"><label>NOTE (OPTIONAL)</label><input name="description" placeholder="e.g. Work lunch" /></div>
        `;
  } else if (type === 'holding') {
      title = 'Add a holding';
      copy = 'Start typing a ticker to choose a stock.';
      fields = `
          <div class="field full ticker-field">
              <label>TICKER</label>
              <input id="holding-search" name="ticker" required placeholder="e.g. 1155, Maybank, AAPL" autocomplete="off" />
              <div class="ticker-suggestions" id="ticker-suggestions"></div>
          </div>
          <input type="hidden" id="holding-name" name="name" value="Unknown" />
          <div class="field"><label>MARKET</label><select name="market" id="holding-market"><option value="US">US stock (USD)</option><option value="MYR">Bursa Malaysia (MYR)</option></select></div>
          <div class="field"><label>UNITS (SHARES)</label><input name="shares" type="number" min="0.0001" step="any" required /></div>
          <div class="field"><label>PRICE PER UNIT (PPU)</label><input name="ppu" type="number" min="0.0001" step="any" required /></div>
          <div class="field"><label>BUY DATE</label><input name="date" type="date" value="${isoDay(0)}" required /></div>
          <div class="field full"><label>PROCESSING FEES</label><input name="fees" type="number" min="0" step="any" value="0" required /></div>
      `;
  } else if (type === 'dividend') {
      title = 'Add Dividend';
      copy = 'Log an individual dividend payout received from a holding.';
      fields = `
          <div class="field full"><label>TICKER</label><input name="ticker" list="holding-tickers" required placeholder="e.g. 1155 or AAPL" /><datalist id="holding-tickers">${tickerListOptions}</datalist></div>
          <div class="field"><label>DIVIDEND AMOUNT</label><input name="amount" type="number" min="0.01" step="0.01" required /></div>
          <div class="field"><label>CURRENCY</label><select name="currency"><option>MYR</option><option>USD</option></select></div>
          <div class="field full"><label>DATE RECEIVED</label><input name="date" type="date" value="${isoDay(0)}" required /></div>
          <div class="field full"><label>NOTE (OPTIONAL)</label><input name="description" placeholder="e.g. Q3 Dividend payout" /></div>
      `;
  } else if (type === 'savings') {
      title = 'Update Funds';
      copy = 'Add new income to shrink your deficit, or update your Base Capital.';
      fields = `
          <div class="field full"><label>ADD EXTRA INCOME (MYR)</label><input name="add_amount" id="savings-add" type="number" min="0" step="0.01" value="0" /></div>
          <div class="field full"><label>ALL-TIME BASE (MYR)</label><input name="total_amount" id="savings-total" type="number" min="0" step="0.01" value="${(Number(state.savings || 0) + Number(state.income || 0)).toFixed(2)}" required /></div>
      `;
  } else if (type === 'monthly_cash') {
      title = 'Monthly Allowance';
      copy = 'Set your pocket allowance for the selected month.';
      fields = `
          <div class="field full"><label>ALLOWANCE FOR ${selectedMonth} (MYR)</label><input name="monthlyCash" type="number" min="0" step="0.01" value="${(state.monthlyCash || {})[selectedMonth] || 0}" required /></div>
      `;
  } else if (type === 'budget') {
      title = 'Set monthly budgets';
      copy = 'Assign limits to your spending categories.';
      fields = allCats.map(cat => `
          <div class="field"><label>${escapeHtml(cat.toUpperCase())} (MYR)</label><input name="${escapeHtml(cat)}" value="${(state.budgets || {})[cat] || ''}" type="number" min="0" step="1" /></div>
      `).join('');
  }

  el('modal').classList.remove('wide-modal');
  el('modal').innerHTML = `
      <form id="entry-form" data-type="${type}">
          <h2>${title}</h2>
          <p>${copy}</p>
          <div class="form-grid">${fields}</div>
          <div class="modal-actions">
              <button class="cancel" type="button" data-close>Cancel</button>
              <button class="primary" type="submit">Save</button>
          </div>
      </form>
  `;
  
  el('modal-backdrop').hidden = false;
  el('entry-form').addEventListener('submit', submitForm); 
  
  if (type === 'holding') bindTickerSuggestions();
  
  if (type === 'savings') {
      const addInp = document.getElementById('savings-add');
      const totInp = document.getElementById('savings-total');
      const baseSave = Number(state.savings || 0) + Number(state.income || 0);
      addInp.addEventListener('input', (e) => {
          totInp.value = (baseSave + (Number(e.target.value) || 0)).toFixed(2);
      });
  }
}

function closeModal() { 
  if (el('modal-backdrop')) {
      el('modal-backdrop').hidden = true; 
  }
}

function showExpenseEditor(id) {
    const x = (state.expenses || []).find(item => item.id === id); 
    if (!x) return;
    
    const existingCats = (state.expenses || []).map(ex => ex.category);
    const allCats = [...new Set([...defaultCategories, ...existingCats])].sort();
    const safeDate = x.date || isoDay(0);
    const dtVal = safeDate.includes('T') ? safeDate : safeDate + 'T12:00';
    
    el('modal').classList.remove('wide-modal');
    el('modal').innerHTML = `
        <form id="entry-form" data-type="edit-expense" data-id="${x.id}">
            <h2>Edit expense</h2>
            <p>Update the transaction and save your changes.</p>
            <div class="form-grid">
                <div class="field full"><label>DESCRIPTION</label><input name="name" required value="${escapeHtml(x.name)}" /></div>
                <div class="field"><label>AMOUNT</label><input name="amount" type="number" min="0.01" step="0.01" value="${x.amount}" required /></div>
                <div class="field"><label>CURRENCY</label><select name="currency"><option ${x.currency==='MYR'?'selected':''}>MYR</option><option ${x.currency==='USD'?'selected':''}>USD</option></select></div>
                <div class="field"><label>CATEGORY 1</label>
                    <select name="category" required>
                        ${allCats.map(c => `<option value="${escapeHtml(c)}" ${x.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="field"><label>CATEGORY 2</label><select name="category2"><option value="No" ${x.category2==='No'?'selected':''}>No</option><option value="Yes" ${x.category2==='Yes'?'selected':''}>Yes</option></select></div>
                <div class="field"><label>DATE & TIME</label><input name="date" type="datetime-local" value="${dtVal}" required /></div>
                <div class="field full"><label>NOTE</label><input name="description" value="${escapeHtml(x.description||'')}" /></div>
            </div>
            <div class="modal-actions">
                <button class="cancel" type="button" data-close>Cancel</button>
                <button class="primary" type="submit">Save changes</button>
            </div>
        </form>
    `;
    el('modal-backdrop').hidden = false; 
    el('entry-form').addEventListener('submit', submitForm);
  }

function showHoldingEditor(id) {
  const h = (state.holdings || []).find(item => item.id === id); 
  if (!h) return;
  
  el('modal').classList.remove('wide-modal');
  el('modal').innerHTML = `
      <form id="entry-form" data-type="edit-holding" data-id="${h.id}">
          <h2>Edit holding</h2>
          <p>Adjust your holding details manually.</p>
          <div class="form-grid">
              <div class="field full"><label>TICKER</label><input name="ticker" required value="${escapeHtml(h.ticker)}" /></div>
              <input type="hidden" name="name" value="${escapeHtml(h.name)}" />
              <div class="field"><label>MARKET</label><select name="market"><option value="US" ${h.market==='US'?'selected':''}>US stock (USD)</option><option value="MYR" ${h.market==='MYR'?'selected':''}>Bursa Malaysia (MYR)</option></select></div>
              <div class="field"><label>UNITS</label><input name="shares" type="number" min="0.0001" step="any" value="${h.shares}" required /></div>
              <div class="field"><label>PRICE PER UNIT (PPU)</label><input name="ppu" type="number" min="0.0001" step="any" value="${h.ppu || h.cost}" required /></div>
              <div class="field full"><label>PROCESSING FEES</label><input name="fees" type="number" min="0" step="any" value="${h.fees || 0}" required /></div>
          </div>
          <div class="modal-actions">
              <button class="cancel" type="button" data-close>Cancel</button>
              <button class="primary" type="submit">Save changes</button>
          </div>
      </form>
  `;
  el('modal-backdrop').hidden = false; 
  el('entry-form').addEventListener('submit', submitForm);
}

function showFundActivityEditor(id) {
    const item = (state.fundActivities || [])
        .find(x => x.id === id);

    if (!item) return;

    const amount = Number(item.amount || 0);

    el('modal').classList.remove('wide-modal');

    el('modal').innerHTML = `
        <form id="entry-form" data-type="edit-fund-activity" data-id="${item.id}">
            <h2>Edit Fund Activity</h2>
            <p>Update the amount and date of this fund activity.</p>

            <div class="form-grid">

                <div class="field full">
                    <label>ACTIVITY TYPE</label>
                    <input
                        type="text"
                        value="${item.type === 'ADD_FUNDS' ? 'Funds Added' : 'Funds Updated'}"
                        disabled
                    />
                </div>

                <div class="field full">
                    <label>AMOUNT (MYR)</label>
                    <input
                        type="number"
                        name="amount"
                        value="${amount}"
                        step="0.01"
                        required
                    />
                </div>

                <div class="field full">
                    <label>DATE & TIME</label>
                    <input
                        type="datetime-local"
                        name="date"
                        value="${item.date || isoDateTime()}"
                        required
                    />
                </div>

            </div>

            <div class="modal-actions">
                <button class="cancel" type="button" data-close>
                    Cancel
                </button>

                <button class="primary" type="submit">
                    Save changes
                </button>
            </div>
        </form>
    `;

    el('modal-backdrop').hidden = false;

    el('entry-form').addEventListener('submit', submitForm);
}

function showNetWorthChangeEditor() {
    const hasManualChange =
        state.netWorthChange !== null &&
        state.netWorthChange !== undefined &&
        Number.isFinite(Number(state.netWorthChange));

    const currentValue = hasManualChange
        ? Number(state.netWorthChange)
        : 0;

    el('modal').classList.remove('wide-modal');

    el('modal').innerHTML = `
        <form id="entry-form" data-type="net-worth-change">

            <h2>Edit Net Worth Change</h2>

            <p>
                Enter the amount you want to display beside your Net Worth.
                The percentage will be calculated automatically.
            </p>

            <div class="form-grid">

                <div class="field full">
                    <label>CHANGE AMOUNT (MYR)</label>

                    <input
                        name="change"
                        type="number"
                        step="0.01"
                        value="${currentValue}"
                        placeholder="e.g. 500 or -500"
                        required
                    />

                    <small style="
                        display:block;
                        margin-top:8px;
                        color:var(--muted);
                    ">
                        Positive = increase · Negative = decrease
                    </small>
                </div>

            </div>

            <div class="modal-actions">

                <button
                    class="cancel"
                    type="button"
                    data-close>
                    Cancel
                </button>

                <button
                    class="primary"
                    type="submit">
                    Save Changes
                </button>

            </div>

        </form>
    `;

    el('modal-backdrop').hidden = false;

    el('entry-form').addEventListener(
        'submit',
        submitForm
    );
}

function showHistoryEditor(id) {
  const item = (state.investmentHistory || []).find(x => x.id === id); 
  if (!item) return;
  
  el('modal').classList.remove('wide-modal');
  
  if (item.type === 'BUY') {
      el('modal').innerHTML = `
          <form id="entry-form" data-type="edit-history-buy" data-id="${item.id}">
              <h2>Edit Buy Transaction</h2>
              <p>Adjust your purchase details.</p>
              <input type="hidden" name="ticker" value="${escapeHtml(item.ticker)}" />
              <input type="hidden" name="currency" value="${item.currency}" />
              <div class="form-grid">
                  <div class="field full"><label>TICKER</label><input disabled value="${escapeHtml(item.ticker)}" /></div>
                  <div class="field"><label>UNITS (SHARES)</label><input name="shares" type="number" min="0.0001" step="any" value="${item.shares}" required /></div>
                  <div class="field"><label>PRICE PER UNIT (PPU)</label><input name="ppu" type="number" min="0.0001" step="any" value="${item.ppu}" required /></div>
                  <div class="field"><label>DATE</label><input name="date" type="date" value="${item.date}" required /></div>
                  <div class="field full"><label>PROCESSING FEES</label><input name="fees" type="number" min="0" step="any" value="${item.fees || 0}" required /></div>
              </div>
              <div class="modal-actions"><button class="cancel" type="button" data-close>Cancel</button><button class="primary" type="submit">Save changes</button></div>
          </form>
      `;
  } else if (item.type === 'DIVIDEND') {
      el('modal').innerHTML = `
          <form id="entry-form" data-type="edit-history-div" data-id="${item.id}">
              <h2>Edit Dividend</h2>
              <p>Adjust your dividend details.</p>
              <input type="hidden" name="ticker" value="${escapeHtml(item.ticker)}" />
              <div class="form-grid">
                  <div class="field full"><label>TICKER</label><input disabled value="${escapeHtml(item.ticker)}" /></div>
                  <div class="field"><label>DIVIDEND AMOUNT</label><input name="amount" type="number" min="0.01" step="0.01" value="${item.amount}" required /></div>
                  <div class="field"><label>CURRENCY</label><select name="currency"><option value="MYR" ${item.currency==='MYR'?'selected':''}>MYR</option><option value="USD" ${item.currency==='USD'?'selected':''}>USD</option></select></div>
                  <div class="field full"><label>DATE</label><input name="date" type="date" value="${item.date}" required /></div>
                  <div class="field full"><label>NOTE (OPTIONAL)</label><input name="description" value="${escapeHtml(item.details || '')}" /></div>
              </div>
              <div class="modal-actions"><button class="cancel" type="button" data-close>Cancel</button><button class="primary" type="submit">Save changes</button></div>
          </form>
      `;
  }
  el('modal-backdrop').hidden = false; 
  el('entry-form').addEventListener('submit', submitForm);
}

function bindTickerSuggestions() {
  const input = el('holding-search');
  const list = el('ticker-suggestions');
  let timer;
  
  const display = items => {
      list.innerHTML = items.map(x => `
          <button type="button" data-ticker="${escapeHtml(x.ticker)}" data-name="${escapeHtml(x.name)}" data-market="${x.market}">
              <b>${escapeHtml(x.ticker)}</b>
              <span>${escapeHtml(x.name)}<small>${x.market==='MYR' ? 'Bursa Malaysia' : 'US stock'}</small></span>
          </button>
      `).join('');
  };
  
  const search = async () => {
      const q = input.value.trim();
      if(!q) {
          display(tickerDirectory.slice(0, 8));
          return;
      }
      
      const local = tickerDirectory.filter(x => x.ticker.toLowerCase().includes(q.toLowerCase()) || x.name.toLowerCase().includes(q.toLowerCase()));
      display(local);
      
      try {
          const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`);
          const payload = await response.json();
          const live = (payload.quotes || []).filter(x => x.symbol && x.shortname).map(x => ({
              ticker: x.symbol.replace('.KL',''),
              name: x.shortname,
              market: x.symbol.endsWith('.KL') ? 'MYR' : 'US'
          }));
          if (live.length) display(live);
      } catch(_) {}
  };
  
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener('focus', search);
  list.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      input.value = b.dataset.ticker;
      el('holding-name').value = b.dataset.name;
      el('holding-market').value = b.dataset.market;
      list.innerHTML = '';
  });
}

async function submitForm(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const values = Object.fromEntries(new FormData(form)); 
  
  if (form.dataset.type === 'profile') { 
      state.profileName = values.profileName; 
  }

  if (form.dataset.type === 'expense') { 
      if (!state.expenses) state.expenses = [];
      state.expenses.push({ id: Date.now(), ...values, amount: Number(values.amount) }); 
      selectedMonth = (values.date || '').slice(0, 7);
      expenseFilter1 = 'all';
      expenseFilter2 = 'all'; 
  } 
  
  if (form.dataset.type === 'edit-expense') { 
      const id = Number(form.dataset.id);
      state.expenses = (state.expenses || []).map(x => x.id === id ? { ...x, ...values, amount: Number(values.amount) } : x);
      expenseFilter1 = 'all';
      expenseFilter2 = 'all'; 
  } 
  
  if (form.dataset.type === 'holding') { 
      const shares = Number(values.shares);
      const ppu = Number(values.ppu);
      const fees = Number(values.fees);
      const ticker = values.ticker.toUpperCase(); 
      const currency = values.market === 'US' ? 'USD' : 'MYR';
      
      if (!state.investmentHistory) state.investmentHistory = [];
      state.investmentHistory.push({
          id: Date.now(), type: 'BUY', ticker: ticker, date: values.date || isoDay(0),
          amount: (shares * ppu), shares: shares, ppu: ppu, fees: fees, currency: currency, details: `${shares} units @ ${ppu}`
      });
      recalculateHolding(ticker, values.name || 'Unknown', values.market, currency);
  }

  if (form.dataset.type === 'dividend') {
      if (!state.investmentHistory) state.investmentHistory = [];
      state.investmentHistory.push({
          id: Date.now(), type: 'DIVIDEND', ticker: values.ticker.toUpperCase(),
          date: values.date || isoDay(0), amount: Number(values.amount), currency: values.currency, details: values.description || 'Dividend payout'
      });
  }
  
  if (form.dataset.type === 'edit-holding') {
      const id = Number(form.dataset.id);
      const shares = Number(values.shares);
      const ppu = Number(values.ppu);
      const fees = Number(values.fees);
      const ticker = values.ticker.toUpperCase(); 
      
      const existing = (state.holdings || []).find(h => h.ticker === ticker && h.id !== id);
      const currency = values.market === 'US' ? 'USD' : 'MYR';
      
      if (existing) {
          existing.shares += shares; 
          existing.ppu = (existing.shares * existing.ppu + shares * ppu) / existing.shares;
          existing.fees = (existing.fees || 0) + fees; 
          existing.cost = ((existing.shares * existing.ppu) + existing.fees) / existing.shares;
          existing.market = values.market; 
          existing.currency = currency;
          state.holdings = (state.holdings || []).filter(x => x.id !== id);
      } else {
          const totalCost = (shares * ppu) + fees;
          state.holdings = (state.holdings || []).map(x => x.id === id ? { ...x, ...values, shares, ppu, fees, cost: totalCost / shares, ticker, currency } : x);
      }
  }

  if (form.dataset.type === 'edit-history-buy') {
      const id = Number(form.dataset.id);
      const shares = Number(values.shares);
      const ppu = Number(values.ppu);
      const fees = Number(values.fees);
      
      state.investmentHistory = (state.investmentHistory || []).map(x => x.id === id ? { ...x, shares, ppu, fees, amount: (shares * ppu), date: values.date, details: `${shares} units @ ${ppu}` } : x);
      const existingH = (state.holdings || []).find(h => h.ticker === values.ticker);
      recalculateHolding(values.ticker, existingH ? existingH.name : 'Unknown', existingH ? existingH.market : 'US', values.currency);
  }

  if (form.dataset.type === 'edit-history-div') {
      const id = Number(form.dataset.id);
      state.investmentHistory = (state.investmentHistory || []).map(x => x.id === id ? { ...x, amount: Number(values.amount), currency: values.currency, date: values.date, details: values.description } : x);
  }
  
  if (form.dataset.type === 'savings') {
    const addAmt = Number(values.add_amount || 0);
    const totalAmt = Number(values.total_amount || 0);
    const currentTotal =
        Number(state.savings || 0) +
        Number(state.income || 0);

    if (!Array.isArray(state.fundActivities)) {
        state.fundActivities = [];
    }

    if (addAmt > 0) {
        state.income =
            Number(state.income || 0) + addAmt;

        state.fundActivities.unshift({
            id: Date.now(),
            type: 'ADD_FUNDS',
            amount: addAmt,
            total:
                Number(state.savings || 0) +
                Number(state.income || 0),
            date: isoDateTime()
        });

    } else if (totalAmt !== currentTotal) {
        state.savings = totalAmt;
        state.income = 0;

        // REMOVED the fundActivities.unshift block for UPDATE_FUNDS here
    }

    state.fundActivities =
        state.fundActivities.slice(0, 50);
}

if (form.dataset.type === 'edit-fund-activity') {
    const id = Number(form.dataset.id);

    const item = (state.fundActivities || [])
        .find(x => x.id === id);

    if (item) {
        const oldAmount = Number(item.amount || 0);
        const newAmount = Number(values.amount || 0);

        const delta = newAmount - oldAmount;

        if (item.type === 'ADD_FUNDS') {

            state.income = Math.max(
                0,
                Number(state.income || 0) + delta
            );

        } else {

            const currentTotal =
                Number(state.savings || 0) +
                Number(state.income || 0);

            const newTotal = currentTotal + delta;

            state.savings = newTotal;
            state.income = 0;
        }

        state.fundActivities =
            (state.fundActivities || []).map(x =>
                x.id === id
                    ? {
                        ...x,
                        amount: newAmount,
                        date: values.date
                    }
                    : x
            );
    }
}

if (form.dataset.type === 'net-worth-change') {
    state.netWorthChange =
        Number(values.change || 0);
}
  
  if (form.dataset.type === 'monthly_cash') { 
      if (!state.monthlyCash) state.monthlyCash = {};
      state.monthlyCash[selectedMonth] = Number(values.monthlyCash); 
  }
  
  if (form.dataset.type === 'budget') { 
      state.budgets = {}; 
      Object.keys(values).forEach(k => { 
          if (values[k] && Number(values[k]) > 0) state.budgets[k] = Number(values[k]); 
      }); 
  }
  
    try {
        await save();
    } catch (err) {
        showToast(
            'Unable to save. Please try again.',
            'error'
        );
        return;
    }

    const savedType = form.dataset.type;

    closeModal();
    renderAll();

    if (savedType === 'holding') {
        showToast('Added Successfully');
        refreshPrices();

    } else if (
        ['edit-holding', 'dividend'].includes(savedType)
    ) {
        refreshPrices();
    }
}

async function refreshPrices() {
    if (!(state.holdings || []).length) return;
    setText('quote-status', 'Fetching live prices…');
    
    let updatedCount = 0;
    const newHoldings = [...state.holdings];
    const timestamp = Date.now();
  
    for (let i = 0; i < newHoldings.length; i++) {
        const h = newHoldings[i];
        try {
            const symbol = h.market === 'MYR' 
                ? (h.ticker.endsWith('.KL') ? h.ticker : `${h.ticker}.KL`) 
                : h.ticker;
                
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_=${timestamp}`;
            
            let quote = null;
  
            const parsePrice = (json) => {
                try {
                    const meta = json?.chart?.result?.[0]?.meta;
                    let p = meta?.regularMarketPrice || meta?.chartPreviousClose || meta?.previousClose;
                    if (typeof p === 'number' && p > 0) return p;
  
                    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
                    if (Array.isArray(closes)) {
                        const valid = closes.filter(v => typeof v === 'number' && !isNaN(v) && v > 0);
                        if (valid.length > 0) return valid[valid.length - 1];
                    }
                } catch (_) {}
                return null;
            };
  
            // Primary Proxy: AllOrigins
            try {
                const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}&disableCache=true`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.contents) quote = parsePrice(JSON.parse(data.contents));
                }
            } catch (_) {}
  
            // Fallback 1: Corsproxy.io
            if (!quote) {
                try {
                    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        quote = parsePrice(data);
                    }
                } catch (_) {}
            }
  
            // Fallback 2: ThingProxy
            if (!quote) {
                try {
                    const res = await fetch(`https://thingproxy.freeboard.io/fetch/${encodeURIComponent(yahooUrl)}`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        quote = parsePrice(data);
                    }
                } catch (_) {}
            }
  
            if (typeof quote === 'number' && quote > 0) { 
                newHoldings[i] = { ...h, price: quote };
                updatedCount++; 
            }
        } catch (err) { 
            console.warn(`Could not fetch live quote for ${h.ticker}:`, err); 
        }
        
        // Delay 600ms between requests to prevent API blocking
        await new Promise(resolve => setTimeout(resolve, 600));
    } 
  
    state.holdings = newHoldings;
    await save(); 
    renderAll();
    setText('quote-status', updatedCount > 0 
        ? `Live quotes updated at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
        : 'Live quotes unavailable — showing saved values');
  }

// -----------------------------------------
// DOM EVENT LISTENERS
// -----------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('.nav-link').forEach(a => {
      a.addEventListener('click', (e) => {
          e.preventDefault();
          document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
          a.classList.add('active');
          document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
          const targetPage = el(a.dataset.page);
          if (targetPage) targetPage.classList.add('active');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          const globalMonthInput = el('global-month');
            if (globalMonthInput) {
            globalMonthInput.value = selectedMonth;
            globalMonthInput.addEventListener('change', (e) => {
            selectedMonth = e.target.value;
            renderAll();
      });
  }
      });
  });

  document.querySelectorAll('[data-open-expense]').forEach(b => b.addEventListener('click', () => showModal('expense')));
  if (el('add-holding')) el('add-holding').addEventListener('click', () => showModal('holding'));
  if (el('add-dividend')) el('add-dividend').addEventListener('click', () => showModal('dividend'));
  if (el('edit-savings')) el('edit-savings').addEventListener('click', () => showModal('savings'));
  if (el('edit-monthly-cash')) el('edit-monthly-cash').addEventListener('click', () => showModal('monthly_cash'));
  if (el('edit-budget')) el('edit-budget').addEventListener('click', () => showModal('budget'));
  if (el('refresh-prices')) el('refresh-prices').addEventListener('click', refreshPrices);
  if (el('profile-btn')) el('profile-btn').addEventListener('click', showProfileModal);
  if (el('view-all-activity')) el('view-all-activity').addEventListener('click', showAllExpensesModal);
  if (el('view-all-expenses')) el('view-all-expenses').addEventListener('click', showAllExpensesModal);
  if (el('view-all-history')) el('view-all-history').addEventListener('click', showAllHistoryModal);

  document.addEventListener('change', e => {
    if (e.target.id === 'expense-month') { selectedMonth = e.target.value; renderAll(); } 
    if (e.target.id === 'expense-category1') { expenseFilter1 = e.target.value; if (el('modal-expense-rows')) renderModalExpenses(); }
    if (e.target.id === 'expense-category2') { expenseFilter2 = e.target.value; if (el('modal-expense-rows')) renderModalExpenses(); }
    if (e.target.id === 'expense-date-from') { expenseDateFrom = e.target.value; if (el('modal-expense-rows')) renderModalExpenses(); }
    if (e.target.id === 'expense-date-to') { expenseDateTo = e.target.value; if (el('modal-expense-rows')) renderModalExpenses(); }
});

  document.querySelectorAll('[data-sort]').forEach(button => {
      button.addEventListener('click', () => {
          const key = button.dataset.sort;
          holdingSort = { key, direction: holdingSort.key === key ? -holdingSort.direction : -1 };
          renderPortfolio();
      });
  });

  if (el('modal-backdrop')) {
      el('modal-backdrop').addEventListener('click', e => {
          if (e.target === el('modal-backdrop') || e.target.closest('[data-close]')) closeModal();
      });
  }

  document.addEventListener('click', e => {
    // Net Worth Edit Button
    if (e.target.closest('#edit-net-worth-change')) {
        e.preventDefault();
        showNetWorthChangeEditor();
        return;
    }

    const sortBtn = e.target.closest('[data-expense-sort]');
    if (sortBtn) {
        const key = sortBtn.dataset.expenseSort;
        expenseSort = { key, direction: expenseSort.key === key ? -expenseSort.direction : -1 };
        renderModalExpenses();
        return;
    }

    const historySortBtn = e.target.closest('[data-history-sort]');
    if (historySortBtn) {
        const key = historySortBtn.dataset.historySort;
        historySort = { key, direction: historySort.key === key ? -historySort.direction : -1 };
        renderPortfolio();
        if (el('modal-backdrop') && !el('modal-backdrop').hidden && el('modal-history-rows')) renderModalHistory();
        return;
    }
  
    if (e.target.closest('#export-expenses')) { exportExpenses(); return; }
    if (e.target.closest('#export-investments')) { exportInvestments(); return; }
    if (e.target.closest('#modal-add-dividend')) { showModal('dividend'); return; }
    if (e.target.closest('#modal-add-holding')) { showModal('holding'); return; }

    const target = e.target.closest('button');
    if (!target) return;
    
    const editExpense = target.dataset.editExpense, expense = target.dataset.deleteExpense;
    const editHolding = target.dataset.editHolding, holding = target.dataset.deleteHolding;
    const editHistory = target.dataset.editHistory, deleteHistory = target.dataset.deleteHistory;


    // ADD THESE TWO
    const editFundActivity = target.dataset.editFundActivity;
    const deleteFundActivity = target.dataset.deleteFundActivity;
  
    if (editExpense) showExpenseEditor(Number(editExpense));

    if (expense) { 
        state.expenses = (state.expenses || []).filter(x => x.id !== Number(expense)); 
        save(); 
        renderAll(); 
        if (el('modal-backdrop') && !el('modal-backdrop').hidden && el('modal-expense-rows')) {
            renderModalExpenses();
        }
    }
  
    if (editHolding) showHoldingEditor(Number(editHolding));

    if (holding) { 
        const hId = Number(holding); 
        const hObj = (state.holdings || []).find(x => x.id === hId);

        if (hObj) {
            state.investmentHistory = (state.investmentHistory || [])
                .filter(x => x.ticker !== hObj.ticker);
        }

        state.holdings = (state.holdings || [])
            .filter(x => x.id !== hId); 

        save(); 
        renderAll(); 
    }
  
    if (editHistory) showHistoryEditor(Number(editHistory));

    if (deleteHistory) {
        const idToDel = Number(deleteHistory); 
        const item = (state.investmentHistory || [])
            .find(x => x.id === idToDel);

        state.investmentHistory = (state.investmentHistory || [])
            .filter(item => item.id !== idToDel);

        if (
            item &&
            item.type === 'BUY'
        ) {
            recalculateHolding(
                item.ticker,
                item.ticker,
                item.currency === 'USD' ? 'US' : 'MYR',
                item.currency
            );
        }

        save(); 
        renderAll();

        if (
            el('modal-backdrop') &&
            !el('modal-backdrop').hidden &&
            el('modal-history-rows')
        ) {
            renderModalHistory();
        }
    }


    // =====================================================
    // ADD THESE FOR RECENT FUND ACTIVITY
    // =====================================================

    if (editFundActivity) {
        showFundActivityEditor(
            Number(editFundActivity)
        );
    }

    if (deleteFundActivity) {
        const idToDel = Number(deleteFundActivity);

        const item = (state.fundActivities || [])
            .find(x => x.id === idToDel);

        if (item) {
            const amount = Number(item.amount || 0);

            if (item.type === 'ADD_FUNDS') {

                state.income = Math.max(
                    0,
                    Number(state.income || 0) - amount
                );

            } else {

                const currentTotal =
                    Number(state.savings || 0) +
                    Number(state.income || 0);

                state.savings = currentTotal - amount;
                state.income = 0;
            }
        }

        state.fundActivities =
            (state.fundActivities || [])
                .filter(x => x.id !== idToDel);

        save();
        renderAll();
    }
});

  if (el('today')) {
      el('today').textContent = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  if (el('theme-toggle')) {
      el('theme-toggle').addEventListener('click', () => {
          const dark = document.body.classList.toggle('dark');
          el('theme-toggle').textContent = dark ? '☼' : '◐';
          storedSet('e-wallet-theme', dark ? 'dark' : 'light');
      });
  }

  if (storedGet('e-wallet-theme') === 'dark') {
      document.body.classList.add('dark');
      if (el('theme-toggle')) el('theme-toggle').textContent = '☼';
  }

});