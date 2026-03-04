// =====================================================
// SUPABASE CONFIGURATION
// =====================================================
const SUPABASE_URL = 'https://wpnteyostbxgeifibmgl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwbnRleW9zdGJ4Z2VpZmlibWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Mjc3NTYsImV4cCI6MjA4NTEwMzc1Nn0.pUrwf6EhnB93CKo2OEZPEIsZFEiofQB0TIjCmlB14Lo';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Current user state
let currentUser = null;

// CALCULATOR DATA CACHES
// =====================================================
let calcHardwareData = [];       // from hardware_products
let calcNightMealsData = [];     // from night_meals_config
let calcFXData = [];             // from fx_monthly_rates (sorted desc)
let calcBenefitsData = [];       // from benefits_config
let calcSSSData = [];            // from sss_contributions or live sss_table_brackets
let calcHMORate = 0;             // from hmo_rates where is_active=true
let calcSalaryRoles = [];        // from salary_ranges (loaded lazily on search)
let allQuotesData = [];          // cached quotes for filtering

// Colombia-specific caches
let coSalaryRolesData = [];      // from salary_ranges_co
let coHMORate = 0;               // Colombia HMO rate (COP per month)
let coFXData = [];               // reuses calcFXData (same table, cop column)
let coNightMealsData = [];       // reuses night_meals_config (CO-applicable)
let currentEditingQuoteIdCO = null; // CO quote editing state
let currentEditingQuoteId = null; // id of quote being edited (null = new)
let roleSearchTimeout = null;

const PRICE_BOOKS = {
    'Current WFO 1-4 Seats':       { USD:699, AUD:999, GBP:533, HKD:5445, SGD:943, EUR:753, CAD:516, NZD:916, isElevate:false },
    'Current WFO 5-8 Seats':       { USD:686, AUD:979.8, GBP:523, HKD:5340, SGD:925, EUR:735, CAD:504, NZD:894, isElevate:false },
    'Current WFO 9-16 Seats':      { USD:671, AUD:958.5, GBP:511, HKD:5224, SGD:905, EUR:716, CAD:491, NZD:871, isElevate:false },
    'Current WFO 17-24 Seats':     { USD:655, AUD:936.1, GBP:500, HKD:5102, SGD:884, EUR:696, CAD:477, NZD:847, isElevate:false },
    'Current WFO 25-32 Seats':     { USD:639, AUD:912.3, GBP:487, HKD:4972, SGD:861, EUR:675, CAD:463, NZD:821, isElevate:false },
    'Current WFO 33-40 Seats':     { USD:621, AUD:887.8, GBP:474, HKD:4838, SGD:838, EUR:653, CAD:448, NZD:795, isElevate:false },
    'Current WFO 41-48 Seats':     { USD:604, AUD:862.6, GBP:460, HKD:4702, SGD:814, EUR:631, CAD:433, NZD:768, isElevate:false },
    'Current WFO 49-75 Seats':     { USD:585, AUD:835.3, GBP:446, HKD:4553, SGD:788, EUR:607, CAD:416, NZD:738, isElevate:false },
    'Current WFO 76-100 Seats':    { USD:564, AUD:805.4, GBP:430, HKD:4390, SGD:760, EUR:580, CAD:398, NZD:706, isElevate:false },
    'Current WFO 101-150 Seats':   { USD:542, AUD:774.4, GBP:413, HKD:4221, SGD:731, EUR:553, CAD:379, NZD:673, isElevate:false },
    'Stack Shift - WFO (Same Seat 2nd shift)': { USD:424, AUD:650, GBP:340, HKD:3287, SGD:599, EUR:575.68, CAD:394.82, NZD:700.27, isElevate:false },
    'CS EVERYWHERE Monthly Commit': { USD:680, AUD:850, GBP:500, HKD:4995, SGD:864, EUR:753, CAD:517, NZD:916, isElevate:false },
    'CS EVERYWHERE 1 Year Commit':  { USD:620, AUD:800, GBP:460, HKD:4702, SGD:814, EUR:709, CAD:487, NZD:863, isElevate:false },
    'CS EVERYWHERE 2 Year Commit':  { USD:580, AUD:750, GBP:430, HKD:4408, SGD:763, EUR:665, CAD:457, NZD:809, isElevate:false },
    'Current ELEVATE WFO':  { USD:699, AUD:999, GBP:533, HKD:5445, SGD:943, EUR:695, CAD:945, NZD:1145, isElevate:true },
    'Current ELEVATE HYBRID': { USD:680, AUD:850, GBP:500, HKD:4995, SGD:864, EUR:590, CAD:805, NZD:975, isElevate:true },
    'Current ELEVATE WFH':  { USD:599, AUD:770, GBP:400, HKD:3000, SGD:700, EUR:520, CAD:710, NZD:860, isElevate:true },
    'Legacy WFO 2018 1-2 Seats':   { USD:600, AUD:999, GBP:455, HKD:4800, SGD:810, EUR:0, CAD:0, NZD:0, isElevate:false },
    'Legacy WFO 2018 3-4 Seats':   { USD:565, AUD:950, GBP:428, HKD:4527, SGD:763, EUR:0, CAD:0, NZD:0, isElevate:false },
    'Legacy WFO 2018 5-10 Seats':  { USD:547, AUD:925, GBP:415, HKD:4391, SGD:739, EUR:0, CAD:0, NZD:0, isElevate:false },
    'Legacy WFO 2018 11-25 Seats': { USD:530, AUD:900, GBP:402, HKD:4254, SGD:716, EUR:0, CAD:0, NZD:0, isElevate:false },
    'Staff On Fiber 2020 Monthly Commit': { USD:425, AUD:650, GBP:340, HKD:3200, SGD:600, EUR:0, CAD:0, NZD:0, isElevate:false },
    'Staff On Fiber 2020 1 Year Commit':  { USD:390, AUD:595, GBP:310, HKD:3000, SGD:550, EUR:0, CAD:0, NZD:0, isElevate:false },
    'Staff On Fiber 2020 2 Year Commit':  { USD:325, AUD:495, GBP:260, HKD:2500, SGD:450, EUR:0, CAD:0, NZD:0, isElevate:false },
    'OfficeFLEX 2022': { USD:504, AUD:649, GBP:340.25, HKD:3282.34, SGD:598.20, EUR:0, CAD:0, NZD:0, isElevate:false },
    'OfficeFLEX 2021': { USD:239, AUD:370, GBP:195, HKD:1870, SGD:345, EUR:0, CAD:0, NZD:0, isElevate:false },
    'CS Now WFH': { USD:599, AUD:770, GBP:400, HKD:3000, SGD:700, EUR:520, CAD:710, NZD:860, isElevate:false },
    'CS Now WFO': { USD:699, AUD:999, GBP:533, HKD:5445, SGD:943, EUR:695, CAD:945, NZD:1145, isElevate:false }
};

const LEGACY_WFO = ['Legacy WFO 2018 1-2 Seats','Legacy WFO 2018 3-4 Seats','Legacy WFO 2018 5-10 Seats','Legacy WFO 2018 11-25 Seats'];
const SETUP_FEES = { AUD:399, GBP:209.85, HKD:2018.51, USD:260.48, SGD:368.34, EUR:279, CAD:379, NZD:457 };
const CURR_SYMBOLS = { AUD:'A$', USD:'$', GBP:'£', HKD:'HK$', SGD:'S$', EUR:'€', CAD:'C$', NZD:'NZ$', PHP:'₱', COP:'COP ' };

// =====================================================
// COLOMBIA CALCULATOR
// =====================================================

// Colombia min wage 2025 (COP)
const CO_MIN_WAGE = 1300000;

// Hardcoded COP benefit defaults (from Excel - Jan 2026 actuals)
const CO_DEFAULTS = {
    hmo_cop:         272772.36,   // Keralty Medisanitas Plan (COP/month)
    pharmacy_cop:     14365.74,   // Company Pharmacy
    life_ins_cop:     21000,      // Life Insurance (Seguros del Estado)
    team_build_cop:   55362.34,   // Annual Team Building (monthly accrual)
    xmas_cop:         55362.34,   // Annual XMAS Party
    social_club_cop: 107885.80,   // Social Club
    microsoft_cop:    45160.07,   // Technology Charge (Microsoft) — fixed COP
    cib_cop:          15000,      // CIB/Staffcentral/Timekeeping
    payroll_cop:      10000,      // Payroll
    uniform_cop:      19154.32,   // Uniforms
    workids_cop:       7500,      // Work IDs
    furniture_cop:   100000,      // WFH Furniture Allowance (desk/chair)
    prof_ind_cop:      6485.73,   // Professional Indemnity Insurance
    pub_liab_cop:      6485.73,   // Public Liability Insurance
    comp_ins_cop:     10891.46,   // Comprehensive Insurance
};

let coBenefitsConfig = []; // CO benefits from benefits_config table
