export type MethodId = 'nsf' | 'owqi' | 'wawqi' | 'ccme' | 'oip';

export interface MethodColumn {
  key: string;
  label: string;
  type: 'text' | 'number';
}

export interface WQIResult {
  site: string;
  lat: number;
  lng: number;
  score: number;
  wqiClass: string;
  color: string;
  contributions: { name: string; value: number }[];
}

export interface MethodConfig {
  id: MethodId;
  name: string;
  description: string;
  columns: MethodColumn[];
  defaultData: any[];
  calculate: (data: any[]) => WQIResult;
}

const baseColumns: MethodColumn[] = [
  { key: 'site', label: 'Sample Site', type: 'text' },
  { key: 'lat', label: 'Latitude', type: 'number' },
  { key: 'lng', label: 'Longitude', type: 'number' }
];

export const wqiMethods: Record<MethodId, MethodConfig> = {
  wawqi: {
    id: 'wawqi',
    name: 'WAWQI (Horton / BIS)',
    description: 'Weighted Arithmetic Water Quality Index Method (widely used in India). Calculates WQI using parameter standards. W_i = 1/S_i, Q_i = (C_i/S_i)*100.',
    columns: [
      ...baseColumns,
      { key: 'param', label: 'Parameter', type: 'text' },
      { key: 'ci', label: 'Observed Val (C_i)', type: 'number' },
      { key: 'si', label: 'Standard limit (S_i)', type: 'number' }
    ],
    defaultData: [
      { id: '1', site: 'Ganges (Rishikesh)', lat: 30.0869, lng: 78.2676, param: 'pH', ci: 7.8, si: 8.5 },
      { id: '2', site: 'Ganges (Rishikesh)', lat: 30.0869, lng: 78.2676, param: 'TDS (mg/l)', ci: 150, si: 500 },
      { id: '3', site: 'Ganges (Rishikesh)', lat: 30.0869, lng: 78.2676, param: 'Hardness', ci: 200, si: 300 },
      { id: '4', site: 'Ganges (Rishikesh)', lat: 30.0869, lng: 78.2676, param: 'Cl-', ci: 30, si: 250 },
      { id: '5', site: 'Ganges (Haridwar)', lat: 29.9457, lng: 78.1642, param: 'pH', ci: 7.9, si: 8.5 },
      { id: '6', site: 'Ganges (Haridwar)', lat: 29.9457, lng: 78.1642, param: 'TDS (mg/l)', ci: 220, si: 500 },
      { id: '7', site: 'Ganges (Haridwar)', lat: 29.9457, lng: 78.1642, param: 'Hardness', ci: 280, si: 300 },
      { id: '8', site: 'Ganges (Haridwar)', lat: 29.9457, lng: 78.1642, param: 'Turbidity', ci: 8, si: 5 }
    ],
    calculate: (data) => {
      let wqiNum = 0;
      let wqiDen = 0;
      const contributions: {name: string, value: number}[] = [];

      data.forEach(r => {
        const ci = Number(r.ci);
        const si = Number(r.si);

        if(!r.param || isNaN(si) || isNaN(ci) || si === 0) return;
        
        const qi = (ci / si) * 100;
        const wi = 1 / si;

        wqiNum += (qi * wi);
        wqiDen += wi;
        contributions.push({ name: r.param, value: qi * wi });
      });

      const score = wqiDen > 0 ? wqiNum / wqiDen : 0;
      
      let wqiClass = 'Unknown';
      let color = '#8884d8';
      
      if(score <= 50) { wqiClass = 'Good'; color = '#3b82f6'; }
      else if(score <= 75) { wqiClass = 'Poor'; color = '#f97316'; }
      else { wqiClass = 'Very Poor'; color = '#ef4444'; }
      
      const site = data[0]?.site || 'Unknown';
      const lat = Number(data[0]?.lat) || 0;
      const lng = Number(data[0]?.lng) || 0;

      return { site, lat, lng, score, wqiClass, color, contributions };
    }
  },
  nsf: {
    id: 'nsf',
    name: 'NSF-WQI',
    description: 'National Sanitation Foundation Water Quality Index. Uses 9 basic parameters with specific weights and sub-index curves (Q values).',
    columns: [
      ...baseColumns,
      { key: 'param', label: 'Parameter', type: 'text' },
      { key: 'qValue', label: 'Q-Value (0-100)', type: 'number' },
      { key: 'weight', label: 'Weight (Wi)', type: 'number' }
    ],
    defaultData: [
      { id: '1', site: 'Ganges (Rishikesh)', lat: 30.0869, lng: 78.2676, param: 'Dissolved Oxygen', qValue: 80, weight: 0.17 },
      { id: '2', site: 'Ganges (Rishikesh)', lat: 30.0869, lng: 78.2676, param: 'Fecal Coliform', qValue: 60, weight: 0.16 },
      { id: '3', site: 'Ganges (Rishikesh)', lat: 30.0869, lng: 78.2676, param: 'pH', qValue: 90, weight: 0.11 },
      { id: '4', site: 'Ganges (Haridwar)', lat: 29.9457, lng: 78.1642, param: 'Dissolved Oxygen', qValue: 65, weight: 0.17 },
      { id: '5', site: 'Ganges (Haridwar)', lat: 29.9457, lng: 78.1642, param: 'Fecal Coliform', qValue: 40, weight: 0.16 },
      { id: '6', site: 'Ganges (Haridwar)', lat: 29.9457, lng: 78.1642, param: 'pH', qValue: 85, weight: 0.11 }
    ],
    calculate: (data) => {
      let score = 0;
      let totalWeight = 0;
      const contributions: {name: string, value: number}[] = [];
      
      data.forEach(r => {
        const qv = Number(r.qValue);
        const w = Number(r.weight);
        if(!isNaN(qv) && !isNaN(w)) {
            score += (qv * w);
            totalWeight += w;
            contributions.push({ name: r.param || 'Unknown', value: qv * w });
        }
      });
      
      if (totalWeight > 0.001) {
         score = score / totalWeight;
      }

      let wqiClass = 'Unknown';
      let color = '#8884d8';
      if(score >= 90) { wqiClass = 'Excellent'; color = '#3b82f6'; }
      else if(score >= 70) { wqiClass = 'Good'; color = '#22c55e'; }
      else if(score >= 50) { wqiClass = 'Medium'; color = '#eab308'; }
      else if(score >= 25) { wqiClass = 'Bad'; color = '#f97316'; }
      else { wqiClass = 'Very Bad'; color = '#ef4444'; }
      
      const site = data[0]?.site || 'Unknown';
      const lat = Number(data[0]?.lat) || 0;
      const lng = Number(data[0]?.lng) || 0;

      return { site, lat, lng, score, wqiClass, color, contributions };
    }
  },
  owqi: {
    id: 'owqi',
    name: 'OWQI (Oregon)',
    description: 'Oregon Water Quality Index. Uses an unweighted harmonic square mean of sub-indices to combine parameters.',
    columns: [
      ...baseColumns,
      { key: 'param', label: 'Parameter', type: 'text' },
      { key: 'si', label: 'Sub-Index (SI)', type: 'number' }
    ],
    defaultData: [
      { id: '1', site: 'Site Alpha', lat: 30.1, lng: 78.2, param: 'DO', si: 88 },
      { id: '2', site: 'Site Alpha', lat: 30.1, lng: 78.2, param: 'BOD', si: 75 },
      { id: '3', site: 'Site Beta', lat: 30.2, lng: 78.3, param: 'DO', si: 92 },
      { id: '4', site: 'Site Beta', lat: 30.2, lng: 78.3, param: 'BOD', si: 80 }
    ],
    calculate: (data) => {
      let sumInvSq = 0;
      let n = 0;
      const contributions: {name: string, value: number}[] = [];
      
      data.forEach(r => {
        const si = Number(r.si);
        if(!isNaN(si) && si > 0) {
          sumInvSq += (1 / Math.pow(si, 2));
          n++;
          contributions.push({ name: r.param || 'Unknown', value: si });
        }
      });
      const score = sumInvSq > 0 ? Math.sqrt(n / sumInvSq) : 0;

      let wqiClass = 'Unknown';
      let color = '#8884d8';
      if(score >= 90) { wqiClass = 'Excellent'; color = '#3b82f6'; }
      else if(score >= 85) { wqiClass = 'Good'; color = '#22c55e'; }
      else if(score >= 80) { wqiClass = 'Fair'; color = '#eab308'; }
      else if(score >= 60) { wqiClass = 'Poor'; color = '#f97316'; }
      else { wqiClass = 'Very Poor'; color = '#ef4444'; }
      
      const site = data[0]?.site || 'Unknown';
      const lat = Number(data[0]?.lat) || 0;
      const lng = Number(data[0]?.lng) || 0;

      return { site, lat, lng, score, wqiClass, color, contributions };
    }
  },
  ccme: {
    id: 'ccme',
    name: 'CCME-WQI',
    description: 'Canadian Council of Ministers of the Environment Index. Based on Scope (F1), Frequency (F2), and Amplitude (F3).',
    columns: [
      ...baseColumns,
      { key: 'param', label: 'Parameter', type: 'text' },
      { key: 'totalTests', label: 'Total Tests', type: 'number' },
      { key: 'failedTests', label: '# Failed', type: 'number' },
      { key: 'sumExcursions', label: 'Sum of Excursions', type: 'number' }
    ],
    defaultData: [
      { id: '1', site: 'Basin 1', lat: 29.5, lng: 79.5, param: 'Dissolved Oxygen', totalTests: 12, failedTests: 2, sumExcursions: 0.45 },
      { id: '2', site: 'Basin 1', lat: 29.5, lng: 79.5, param: 'Phosphorus', totalTests: 12, failedTests: 5, sumExcursions: 3.2 },
      { id: '3', site: 'Basin 2', lat: 30.5, lng: 78.5, param: 'Dissolved Oxygen', totalTests: 12, failedTests: 0, sumExcursions: 0 },
      { id: '4', site: 'Basin 2', lat: 30.5, lng: 78.5, param: 'Phosphorus', totalTests: 12, failedTests: 8, sumExcursions: 12.5 }
    ],
    calculate: (data) => {
      let totalParams = 0;
      let failedParams = 0;
      let totalTests = 0;
      let failedTests = 0;
      let totalExcursions = 0;

      data.forEach(r => {
        const tt = Number(r.totalTests);
        const ft = Number(r.failedTests);
        const se = Number(r.sumExcursions);

        if (tt > 0) {
          totalParams++;
          totalTests += tt;
          failedTests += isNaN(ft) ? 0 : ft;
          totalExcursions += isNaN(se) ? 0 : se;
          
          if (!isNaN(ft) && ft > 0) {
            failedParams++;
          }
        }
      });

      const F1 = totalParams > 0 ? (failedParams / totalParams) * 100 : 0;
      const F2 = totalTests > 0 ? (failedTests / totalTests) * 100 : 0;
      const nse = totalTests > 0 ? totalExcursions / totalTests : 0;
      const F3 = nse === 0 ? 0 : nse / (0.01 * nse + 0.01);

      const computed = Math.sqrt(F1*F1 + F2*F2 + F3*F3);
      const score = 100 - (computed / 1.732);
      
      let wqiClass = 'Unknown';
      let color = '#8884d8';
      if(score >= 95) { wqiClass = 'Excellent'; color = '#3b82f6'; }
      else if(score >= 80) { wqiClass = 'Good'; color = '#22c55e'; }
      else if(score >= 65) { wqiClass = 'Fair'; color = '#eab308'; }
      else if(score >= 45) { wqiClass = 'Marginal'; color = '#f97316'; }
      else { wqiClass = 'Poor'; color = '#ef4444'; }
      
      const site = data[0]?.site || 'Unknown';
      const lat = Number(data[0]?.lat) || 0;
      const lng = Number(data[0]?.lng) || 0;

      return { 
        site, lat, lng, score, wqiClass, color, 
        contributions: [
          { name: 'Scope (F1)', value: F1 },
          { name: 'Frequency (F2)', value: F2 },
          { name: 'Amplitude (F3)', value: F3 }
        ] 
      };
    }
  },
  oip: {
    id: 'oip',
    name: 'OIP (Overall Index)',
    description: 'Overall Index of Pollution (NEERI). Uses equal weighting 1/n sum(Pi). Captures geogenic parameters.',
    columns: [
      ...baseColumns,
      { key: 'param', label: 'Parameter', type: 'text' },
      { key: 'ci', label: 'Observed Val (C_i)', type: 'number' },
      { key: 'si', label: 'Standard limit (S_i)', type: 'number' }
    ],
    defaultData: [
      { id: '1', site: 'Yamuna River', lat: 28.6139, lng: 77.2090, param: 'Arsenic (As)', ci: 0.02, si: 0.01 },
      { id: '2', site: 'Yamuna River', lat: 28.6139, lng: 77.2090, param: 'Fluoride (F)', ci: 1.2, si: 1.0 },
      { id: '3', site: 'Yamuna River', lat: 28.6139, lng: 77.2090, param: 'pH', ci: 7.5, si: 8.5 }
    ],
    calculate: (data) => {
      let totalPi = 0;
      let count = 0;
      const contributions: {name: string, value: number}[] = [];

      data.forEach(r => {
        const ci = Number(r.ci);
        const si = Number(r.si);

        if(!r.param || isNaN(si) || isNaN(ci) || si === 0) return;
        
        const Pi = (ci / si) * 100;
        totalPi += Pi;
        count++;
        contributions.push({ name: r.param, value: Pi });
      });

      const score = count > 0 ? totalPi / count : 0;
      
      let wqiClass = 'Unknown';
      let color = '#8884d8';
      
      // OIP scale (NEERI): <10 Excellent, 10-20 Good, etc. But to make it uniform we scale:
      if(score <= 10) { wqiClass = 'Excellent'; color = '#3b82f6'; }
      else if(score <= 20) { wqiClass = 'Good'; color = '#22c55e'; }
      else if(score <= 50) { wqiClass = 'Poor'; color = '#f97316'; }
      else { wqiClass = 'Very Poor'; color = '#ef4444'; }
      
      const site = data[0]?.site || 'Unknown';
      const lat = Number(data[0]?.lat) || 0;
      const lng = Number(data[0]?.lng) || 0;

      return { site, lat, lng, score, wqiClass, color, contributions };
    }
  }
};
