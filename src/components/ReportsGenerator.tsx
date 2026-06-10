import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  Legend,
} from "recharts";
import { toPng } from "html-to-image";
import { Download, Settings2, BarChart2, Table as TableIcon, Globe } from "lucide-react";

interface ReportsGeneratorProps {
  siteResults: { site: string; score: number; wqiClass: string; color: string }[];
  data: any[];
  methodConfig: any;
}

const translations = {
  en: {
    analyticsTitle: "Analytics & Output Reports",
    exportBtn: "Export Dashboard",
    graphSettings: "Graph Settings",
    graphHeight: "Graph Height (px)",
    fontSize: "Font Size (px)",
    fontColor: "Font Color",
    themeColor: "Theme Color",
    fontFamily: "Font Family",
    distributionFormatter: "Distribution Formatter",
    distributionClasses: "Distribution Classes",
    finalWqiTitle: "Final Water Quality Index (WQI) by Site",
    factorAnalysisTitle: "Water Quality Factor Analysis",
    paramLabel: "Param",
    wqiDistributionTitle: "WQI Score Distribution",
    thClassRange: "Class / Range",
    thNumSites: "Number of Sites",
    thPercentage: "Percentage (%)",
    thSitesList: "Sites List",
    language: "Language",
    classes: "Classes",
    classPrefix: "Class"
  },
  hi: {
    analyticsTitle: "एनालिटिक्स और आउटपुट रिपोर्ट",
    exportBtn: "डैशबोर्ड निर्यात करें",
    graphSettings: "ग्राफ़ सेटिंग्स",
    graphHeight: "ग्राफ़ की ऊंचाई (px)",
    fontSize: "फ़ॉन्ट का आकार (px)",
    fontColor: "फ़ॉन्ट का रंग",
    themeColor: "थीम का रंग",
    fontFamily: "फ़ॉन्ट परिवार",
    distributionFormatter: "वितरण प्रारूप",
    distributionClasses: "वितरण वर्ग",
    finalWqiTitle: "साइट के अनुसार अंतिम जल गुणवत्ता सूचकांक (WQI)",
    factorAnalysisTitle: "जल गुणवत्ता कारक विश्लेषण",
    paramLabel: "पैरामीटर",
    wqiDistributionTitle: "WQI स्कोर वितरण",
    thClassRange: "वर्ग / सीमा",
    thNumSites: "साइटों की संख्या",
    thPercentage: "प्रतिशत (%)",
    thSitesList: "साइटों की सूची",
    language: "भाषा",
    classes: "वर्ग",
    classPrefix: "वर्ग"
  }
};

const fontOptions = [
  "Inter", "Arial", "Times New Roman", "Courier New", "Verdana", "Georgia", 
  "Palatino", "Garamond", "Bookman", "Comic Sans MS", "Trebuchet MS", "Arial Black", 
  "Impact", "Tahoma", "Helvetica", "Calibri", "Cambria", "Roboto", "Open Sans", 
  "Lato", "Montserrat", "Oswald", "Raleway", "Mangal", "Aparajita", "Kokila", 
  "Utsaah", "Noto Sans Devanagari", "Tiro Devanagari Hindi", "Mukta", "Yantramanav",
  "Kalam", "Hind", "Amita"
];

export function ReportsGenerator({ siteResults, data, methodConfig }: ReportsGeneratorProps) {
  // Graph Settings State
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const t = translations[language];

  const [graphSize, setGraphSize] = useState<number>(400);
  const [fontSize, setFontSize] = useState<number>(12);
  const [fontColor, setFontColor] = useState<string>("#333333");
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [chartColor, setChartColor] = useState<string>("#10b981");

  // Dynamically load font
  useEffect(() => {
    // Only load non-standard fonts to avoid network errors
    const stdFonts = ["Arial", "Courier New", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana", "Arial Black", "Impact", "Tahoma", "Helvetica", "Calibri", "Cambria", "Mangal", "Aparajita", "Kokila", "Utsaah"];
    if (!stdFonts.includes(fontFamily)) {
        const linkId = `dynamic-font-${fontFamily.replace(/\s+/g, '-')}`;
        if (!document.getElementById(linkId)) {
            const fontUrl = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;
            const link = document.createElement("link");
            link.id = linkId;
            link.rel = "stylesheet";
            link.href = fontUrl;
            link.crossOrigin = "anonymous";
            document.head.appendChild(link);
        }
    }
  }, [fontFamily]);

  // Factor graph state
  const parameters = methodConfig.columns.filter((c: any) => c.key !== "site" && c.key !== "lat" && c.key !== "lng");
  const [selectedFactor, setSelectedFactor] = useState<string>(parameters[0]?.key || "");

  // Distribution classes state
  const [classCount, setClassCount] = useState<number>(5);

  const chartRef = useRef<HTMLDivElement>(null);

  // Prepare factor data
  const factorData = useMemo(() => {
    return data.map((d) => ({
      site: d.site,
      value: Number(d[selectedFactor]) || 0,
    }));
  }, [data, selectedFactor]);

  // Handle PNG Export
  const handleExport = async () => {
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        style: { fontFamily },
        skipFonts: true,
        filter: (node) => {
          if (node.tagName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet') {
            if ((node as HTMLLinkElement).href.includes('fonts.googleapis.com')) return false;
          }
          if (node.tagName === 'STYLE' && node.id && node.id.startsWith('dynamic-font-')) {
            return false;
          }
          return true;
        }
      });
      const link = document.createElement("a");
      link.download = `WQI_Report_${methodConfig.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export Error:", err);
      alert("Failed to export report image.");
    }
  };

  // Distribution calculate
  const distributionResult = useMemo(() => {
    if (!siteResults || siteResults.length === 0) return [];
    const min = Math.min(...siteResults.map(s => s.score));
    const max = Math.max(...siteResults.map(s => s.score));
    // Provide a small buffer
    const range = (max - min) || 10; 
    const step = range / classCount;
    
    // Label classes generic
    const dist: {label: string; minScore: number; maxScore: number; sites: string[]; count: number}[] = [];
    for (let i = 0; i < classCount; i++) {
        const thresholdLow = min + (i * step);
        const thresholdHigh = min + ((i + 1) * step);
        const label = `${t.classPrefix} ${i+1} (${thresholdLow.toFixed(1)} - ${thresholdHigh.toFixed(1)})`;
        dist.push({
            label,
            minScore: thresholdLow,
            maxScore: thresholdHigh,
            sites: [],
            count: 0
        });
    }

    siteResults.forEach(res => {
        for (let i = 0; i < classCount; i++) {
            if (i === classCount - 1) { // last class include upperbound
                if (res.score >= dist[i].minScore && res.score <= dist[i].maxScore + 0.01) {
                    dist[i].sites.push(res.site);
                    dist[i].count++;
                    break;
                }
            } else {
                if (res.score >= dist[i].minScore && res.score < dist[i].maxScore) {
                    dist[i].sites.push(res.site);
                    dist[i].count++;
                    break;
                }
            }
        }
    });

    return dist;
  }, [siteResults, classCount]);

  if (siteResults.length === 0) return null;

  return (
    <div className="bg-white border border-blue-100/60 mt-8 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col transition-shadow hover:shadow-[0_8px_30px_rgba(4,102,122,0.06)]">
      <div className="px-5 py-4 border-b border-blue-50 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-cyan-50/30 flex-wrap gap-4">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-cyan-600" />
          {t.analyticsTitle}
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-blue-100/60 rounded-md px-2 py-1 shadow-sm">
            <Globe className="w-4 h-4 text-cyan-500" />
            <select
              value={language}
              onChange={(e: any) => setLanguage(e.target.value)}
              className="text-xs font-semibold bg-transparent border-none focus:ring-0 text-cyan-800 cursor-pointer outline-none"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
            </select>
          </div>
          <button
            onClick={handleExport}
            className="text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 border-transparent hover:from-cyan-500 hover:to-blue-500 text-white transition-all px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm shadow-cyan-900/20"
          >
            <Download className="w-3.5 h-3.5" />
            {t.exportBtn}
          </button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Settings Panel */}
        <div className="col-span-1 border border-blue-100/60 rounded-xl p-5 bg-gradient-to-br from-blue-50/30 to-cyan-50/10 flex flex-col gap-4 shadow-inner">
          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-700">
            <Settings2 className="w-4 h-4 text-cyan-600" />
            {t.graphSettings}
          </h3>
          
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            {t.graphHeight}: {graphSize}
            <input 
              type="range" min="300" max="800" step="50" 
              value={graphSize} onChange={e => setGraphSize(Number(e.target.value))} 
              className="accent-cyan-600"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            {t.fontSize}: {fontSize}
            <input 
              type="range" min="8" max="24" step="1" 
              value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
              className="accent-cyan-600" 
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            {t.fontColor}
            <input 
              type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} 
              className="w-full h-8 rounded cursor-pointer border border-blue-200"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            {t.themeColor}
            <input 
              type="color" value={chartColor} onChange={e => setChartColor(e.target.value)} 
              className="w-full h-8 rounded cursor-pointer border border-blue-200"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            {t.fontFamily}
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="p-1.5 border border-blue-200 rounded focus:ring-cyan-500 focus:border-cyan-500 text-slate-700 font-medium">
              {fontOptions.map(font => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </label>

          <hr className="border-blue-100/60 my-2" />

          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-700">
            <TableIcon className="w-4 h-4 text-cyan-600" />
            {t.distributionFormatter}
          </h3>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            {t.distributionClasses}
            <select value={classCount} onChange={e => setClassCount(Number(e.target.value))} className="p-1.5 border border-blue-200 rounded focus:ring-cyan-500 focus:border-cyan-500 text-slate-700 font-medium">
              <option value={3}>3 {t.classes}</option>
              <option value={4}>4 {t.classes}</option>
              <option value={5}>5 {t.classes}</option>
            </select>
          </label>
        </div>

        {/* Charts & Tables Container (Export Target) */}
        <div 
          className="col-span-1 md:col-span-3 flex flex-col gap-8 bg-white p-6 border border-blue-100/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl"
          ref={chartRef}
          style={{ fontFamily: fontFamily }}
        >
          {siteResults.length > 0 && (
            <>
              {/* Site-wise WQI Graph */}
              <div>
                <h3 className="font-bold text-lg mb-4 text-center" style={{ color: fontColor, fontSize: fontSize + 4, fontFamily }}>
                  {t.finalWqiTitle}
                </h3>
                <div style={{ height: graphSize, width: "100%" }}>
                  <ResponsiveContainer>
                    <BarChart data={siteResults} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis 
                        dataKey="site" 
                        angle={-45} 
                        textAnchor="end" 
                        tick={{ fontSize, fill: fontColor, fontFamily }}
                        interval={0}
                        height={60}
                      />
                      <YAxis tick={{ fontSize, fill: fontColor, fontFamily }} />
                      <RechartsTooltip 
                        contentStyle={{ background: '#fff', border: '1px solid #ccc', borderRadius: '4px', color: fontColor, fontSize, fontFamily }}
                        formatter={(val: any) => [Number(val).toFixed(2), ""]}
                      />
                      <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                        {siteResults.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || chartColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Factor-wise Graph */}
              <div className="mt-8">
                <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
                  <h3 className="font-bold text-lg text-center" style={{ color: fontColor, fontSize: fontSize + 4, fontFamily }}>
                    {t.factorAnalysisTitle}
                  </h3>
                  <div className="flex items-center gap-2" style={{ color: fontColor, fontSize }}>
                    <span className="font-medium">{t.paramLabel}:</span>
                    <select 
                      value={selectedFactor} 
                      onChange={e => setSelectedFactor(e.target.value)}
                      className="p-1 border border-neutral-300 rounded text-base min-w-[120px]"
                      style={{ color: '#000', fontSize }} // always black inside select for readability
                    >
                      {parameters.map((p: any) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div style={{ height: graphSize, width: "100%" }}>
                  <ResponsiveContainer>
                    <LineChart data={factorData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis 
                        dataKey="site" 
                        angle={-45} 
                        textAnchor="end" 
                        tick={{ fontSize, fill: fontColor, fontFamily }}
                        interval={0}
                        height={60}
                      />
                      <YAxis tick={{ fontSize, fill: fontColor, fontFamily }} />
                      <RechartsTooltip 
                         contentStyle={{ background: '#fff', border: '1px solid #ccc', borderRadius: '4px', color: fontColor, fontSize, fontFamily }}
                         formatter={(val: any) => [Number(val).toFixed(3), ""]}
                      />
                      <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={3} dot={{ r: 4, fill: chartColor }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Distribution Table */}
              <div className="mt-8">
                 <h3 className="font-bold text-lg mb-4 text-center" style={{ color: fontColor, fontSize: fontSize + 4, fontFamily }}>
                  {t.wqiDistributionTitle} ({classCount} {t.classes})
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse" style={{ color: fontColor, fontSize, fontFamily }}>
                        <thead>
                            <tr style={{ borderBottom: `2px solid ${fontColor}40` }}>
                                <th className="py-2 px-4 font-bold">{t.thClassRange}</th>
                                <th className="py-2 px-4 font-bold">{t.thNumSites}</th>
                                <th className="py-2 px-4 font-bold">{t.thPercentage}</th>
                                <th className="py-2 px-4 font-bold">{t.thSitesList}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {distributionResult.map((res, i) => {
                                const percentage = siteResults.length > 0 ? (res.count / siteResults.length) * 100 : 0;
                                return (
                                    <tr key={i} style={{ borderBottom: `1px solid ${fontColor}20` }}>
                                        <td className="py-3 px-4 font-medium">{res.label}</td>
                                        <td className="py-3 px-4">{res.count}</td>
                                        <td className="py-3 px-4">{percentage.toFixed(1)}%</td>
                                        <td className="py-3 px-4 text-sm" style={{ fontSize: fontSize - 2 }}>
                                            {res.sites.join(", ") || "-"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
