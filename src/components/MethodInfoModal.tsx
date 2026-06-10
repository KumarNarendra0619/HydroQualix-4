import React from "react";
import { MethodId, wqiMethods } from "../utils/wqi";

interface MethodInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  methodId: MethodId;
}

const methodDetails: Record<MethodId, { parameters: string[], categories: { range: string, class: string, color: string }[] }> = {
  wawqi: {
    parameters: ["pH", "Electrical Conductivity", "TDS", "Alkalinity", "Hardness", "Calcium", "Magnesium", "Chloride", "Sulfate", "Nitrate", "Fluoride", "Iron", "Total Coliforms", "BOD", "DO", "Turbidity", "Others..."],
    categories: [
      { range: "0 - 25", class: "Excellent", color: "bg-blue-500" },
      { range: "26 - 50", class: "Good", color: "bg-green-500" },
      { range: "51 - 75", class: "Poor", color: "bg-yellow-500" },
      { range: "76 - 100", class: "Very Poor", color: "bg-orange-500" },
      { range: "> 100", class: "Unsuitable for drinking", color: "bg-red-500" }
    ]
  },
  nsf: {
    parameters: ["Dissolved Oxygen (DO)", "Fecal Coliform", "pH", "Biochemical Oxygen Demand (BOD)", "Temperature Change", "Total Phosphate", "Nitrate", "Turbidity", "Total Solids"],
    categories: [
      { range: "90 - 100", class: "Excellent", color: "bg-blue-500" },
      { range: "70 - 89", class: "Good", color: "bg-green-500" },
      { range: "50 - 69", class: "Medium / Fair", color: "bg-yellow-500" },
      { range: "25 - 49", class: "Bad / Poor", color: "bg-orange-500" },
      { range: "0 - 24", class: "Very Bad", color: "bg-red-500" }
    ]
  },
  owqi: {
    parameters: ["Temperature", "Dissolved Oxygen (DO)", "Biochemical Oxygen Demand (BOD)", "pH", "Total Solids / TDS", "Ammonia and Nitrate Nitrogen", "Total Phosphorus", "Fecal Coliform"],
    categories: [
      { range: "90 - 100", class: "Excellent", color: "bg-blue-500" },
      { range: "85 - 89", class: "Good", color: "bg-green-500" },
      { range: "80 - 84", class: "Fair", color: "bg-yellow-500" },
      { range: "60 - 79", class: "Poor", color: "bg-orange-500" },
      { range: "10 - 59", class: "Very Poor", color: "bg-red-500" }
    ]
  },
  ccme: {
    parameters: ["Requires specific water quality guidelines/objectives. Typically includes DO, pH, Phosphorus, Nitrogen, Metals, Pesticides, etc."],
    categories: [
      { range: "95 - 100", class: "Excellent", color: "bg-blue-500" },
      { range: "80 - 94", class: "Good", color: "bg-green-500" },
      { range: "65 - 79", class: "Fair", color: "bg-yellow-500" },
      { range: "45 - 64", class: "Marginal", color: "bg-orange-500" },
      { range: "0 - 44", class: "Poor", color: "bg-red-500" }
    ]
  },
  oip: {
    parameters: ["pH", "Turbidity", "TDS", "Hardness", "Chlorides", "Fluorides", "Nitrates", "Sulphates", "BOD", "DO", "Coliforms", "Arsenic", "Iron", "Heavy Metals"],
    categories: [
      { range: "0 - 10", class: "Excellent", color: "bg-blue-500" },
      { range: "10 - 20", class: "Good", color: "bg-green-500" },
      { range: "20 - 50", class: "Poor", color: "bg-orange-500" },
      { range: "> 50", class: "Very Poor", color: "bg-red-500" }
    ]
  }
};

export function MethodInfoModal({ isOpen, onClose, methodId }: MethodInfoModalProps) {
  if (!isOpen) return null;

  const currentMethod = wqiMethods[methodId];
  const details = methodDetails[methodId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 absolute w-full top-0 left-0 z-10">
          <h2 className="text-lg font-semibold text-neutral-900">{currentMethod.name} Details</h2>
          <button 
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto mt-14 pb-20">
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Method Description</h3>
            <p className="text-neutral-600 leading-relaxed text-sm">{currentMethod.description}</p>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-emerald-700 mb-3 uppercase tracking-wide">Typical Parameters</h3>
            <div className="flex flex-wrap gap-2">
              {details.parameters.map((p, i) => (
                <span key={i} className="inline-block px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-md border border-neutral-200">
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-emerald-700 mb-3 uppercase tracking-wide">WQI Categories</h3>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                  <tr>
                    <th className="px-4 py-2 w-16">Color</th>
                    <th className="px-4 py-2">Index Range</th>
                    <th className="px-4 py-2">Water Quality Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {details.categories.map((c, i) => (
                    <tr key={i} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3">
                        <div className={`w-4 h-4 rounded-full ${c.color} shadow-sm`}></div>
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-800">{c.range}</td>
                      <td className="px-4 py-3 text-neutral-600">{c.class}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-200">
            <h4 className="font-semibold text-neutral-700 mb-2 text-xs">Method Attribution Notice</h4>
            <div className="text-[10px] text-neutral-500 leading-relaxed space-y-2">
              <p>HYDROQUALIX-4&trade; implements established Water Quality Index methodologies including:</p>
              <ul className="list-disc pl-4 space-y-1">
                {methodId === 'wawqi' && <li>WAWQI (Weighted Arithmetic Water Quality Index) &ndash; Horton (1965)</li>}
                {methodId === 'nsf' && <li>NSF-WQI &ndash; Brown et al. (1970, 1972)</li>}
                {methodId === 'owqi' && <li>OWQI (Oregon Water Quality Index) &ndash; Cude (2001)</li>}
                {methodId === 'ccme' && <li>CCME-WQI &ndash; Canadian Council of Ministers of the Environment (2001)</li>}
                {methodId === 'oip' && <li>OIP (Overall Index of Pollution) &ndash; Mishra &amp; Patel (2001)</li>}
              </ul>
              <p>The mathematical formulations, weighting schemes, and classification frameworks remain attributable to their original authors. HYDROQUALIX-4&trade; provides an integrated software implementation, automation framework, comparative analysis environment, reporting system, and decision-support platform for these methodologies.</p>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-0 w-full px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-md shadow-sm hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
