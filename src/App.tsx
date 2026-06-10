import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Plus,
  Trash2,
  Settings2,
  Calculator,
  Info,
  Map as MapIcon,
  Table,
  Download,
  FileSpreadsheet,
  FileImage,
  FileText,
  Upload,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  Marker,
  Popup,
  useMap,
  LayersControl,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";
import { kml } from "@tmcw/togeojson";
import * as shp from "shpjs";

function parseCoordinate(coord: string | number): number {
  if (typeof coord === 'number') return coord;
  if (!coord) return 0;
  // Clean number string
  const num = parseFloat(coord);
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(coord.trim())) {
    return num;
  }
  // Parse DMS: 30° 15' 20" N
  const match = coord.match(/(\d+)[°\s]+(\d+)['\s]+([\d.]+)["\s]*([NSEW]?)/i);
  if (match) {
    let dd = parseFloat(match[1]) + parseFloat(match[2])/60 + parseFloat(match[3])/3600;
    const dir = match[4]?.toUpperCase();
    if (dir === 'S' || dir === 'W') {
      dd = -dd;
    }
    return dd;
  }
  return isNaN(num) ? 0 : num;
}

import { wqiMethods, MethodId, WQIResult } from "./utils/wqi";
import { cn } from "./utils/cn";
import {
  InterpolationOverlay,
  SpatialPoint,
} from "./components/InterpolationOverlay";
import { MethodInfoModal } from "./components/MethodInfoModal";
import { ReportsGenerator } from "./components/ReportsGenerator";
import { AiAssistant } from "./components/AiAssistant";

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  
  useEffect(() => {
    // Fix map rendering issues (gray tiles) on load or container resize
    setTimeout(() => {
      map.invalidateSize();
    }, 250);
    
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    
    const container = map.getContainer();
    if (container) {
      resizeObserver.observe(container);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);
  return null;
}

export default function App() {
  const [selectedMethod, setSelectedMethod] = useState<MethodId>("wawqi");
  const [data, setData] = useState(() =>
    JSON.parse(JSON.stringify(wqiMethods["wawqi"].defaultData)),
  );
  const [activeSite, setActiveSite] = useState<string | null>(null);
  const [importedGeoJson, setImportedGeoJson] = useState<any>(null);
  const [interpMethod, setInterpMethod] = useState<
    "none" | "idw" | "kriging" | "rbf"
  >("none");
  const [isMethodInfoModalOpen, setIsMethodInfoModalOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setData(JSON.parse(JSON.stringify(wqiMethods[selectedMethod].defaultData)));
    setActiveSite(null);
  }, [selectedMethod]);

  const methodConfig = wqiMethods[selectedMethod];

  // Group data and calculate WQI for each site
  const siteResults = useMemo(() => {
    const grouped = data.reduce((acc: Record<string, any[]>, row: any) => {
      const site = row.site || "Unknown";
      if (!acc[site]) acc[site] = [];
      acc[site].push(row);
      return acc;
    }, {});

    const results: WQIResult[] = [];
    Object.keys(grouped).forEach((site) => {
      const r = methodConfig.calculate(grouped[site]);
      r.site = site;
      results.push(r);
    });
    return results;
  }, [data, methodConfig]);

  const currentResult = activeSite
    ? siteResults.find((r) => r.site === activeSite)
    : siteResults[0] || null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.name.toLowerCase().endsWith('.zip')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const parser = typeof shp === 'function' ? shp : (shp as any).parseZip || (shp as any).default;
          if (!parser) throw new Error("shpjs parser not found");
          const geojson = await parser(buffer);
          setImportedGeoJson(geojson);
        } catch (err) {
          console.error("Failed to parse shapefile", err);
          alert("Failed to parse Shapefile. Ensure it's a valid zipped shapefile.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          const dom = new DOMParser().parseFromString(text, "text/xml");
          const converted = kml(dom);
          setImportedGeoJson(converted);
        }
      };
      reader.readAsText(file);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDataImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
          type: "array",
        });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) return;

        const parsedData: any[] = [];

        const parameterMappings = [
          {
            pattern: /10_TDS|tds/i,
            param: "TDS (mg/l)",
            si: 500,
            qvWeight: 0.08,
          },
          {
            pattern: /13_pH|20_pH|^pH$/i,
            param: "pH",
            si: 8.5,
            qvWeight: 0.11,
          },
          {
            pattern: /21_Total Alkalinity|alkalinity/i,
            param: "Alkalinity",
            si: 200,
            qvWeight: 0.1,
          },
          {
            pattern: /22_Total Hardness|hardness/i,
            param: "Hardness",
            si: 300,
            qvWeight: 0.1,
          },
          {
            pattern: /23_Calcium|calcium/i,
            param: "Calcium",
            si: 75,
            qvWeight: 0.1,
          },
          {
            pattern: /24_Magnesium|magnesium/i,
            param: "Magnesium",
            si: 30,
            qvWeight: 0.1,
          },
          {
            pattern: /25_Chloride|chloride/i,
            param: "Cl-",
            si: 250,
            qvWeight: 0.08,
          },
          {
            pattern: /26_Fluoride|fluoride/i,
            param: "Fluoride",
            si: 1,
            qvWeight: 0.1,
          },
          { pattern: /27_Iron|iron/i, param: "Iron", si: 1, qvWeight: 0.1 },
          {
            pattern: /28_Nitrate|nitrate/i,
            param: "Nitrate",
            si: 45,
            qvWeight: 0.1,
          },
          { pattern: /11_EC|^ec$/i, param: "EC", si: 1000, qvWeight: 0.08 },
        ];

        json.forEach((row: any) => {
          if (row.param) {
            parsedData.push({
              ...row,
              id: row.id || Math.random().toString(36).substr(2, 9),
            });
            return;
          }

          const siteName =
            row["01_Sample_Code"] ||
            row["1_Sample_Code"] ||
            row["Sample_Code"] ||
            row["Site"] ||
            `Site_${Math.random().toString(36).substring(7)}`;
          const lat =
            parseCoordinate(row["Lat"] || row["Latitude"] || row["latitude"] || 0);
          const lng =
            parseCoordinate(
              row["Lng"] || row["Long"] || row["Longitude"] || row["longitude"] || 0
            );

          parameterMappings.forEach((mapping) => {
            const rowKey = Object.keys(row).find((k) =>
              mapping.pattern.test(k),
            );
            if (rowKey && row[rowKey] !== undefined && row[rowKey] !== "") {
              const val = Number(row[rowKey]);
              if (!isNaN(val)) {
                let r: any = {
                  id: Math.random().toString(36).substr(2, 9),
                  site: siteName,
                  lat,
                  lng,
                  param: mapping.param,
                };

                if (methodConfig.id === "wawqi" || methodConfig.id === "owqi") {
                  r.ci = val;
                  r.si = mapping.si;
                } else if (
                  methodConfig.id === "nsf" ||
                  methodConfig.id === "ccme"
                ) {
                  r.qValue = val;
                  r.weight = mapping.qvWeight;
                  r.value = val;
                  r.objective = mapping.si;
                  r.ci = val;
                } else {
                  r.val = val;
                  r.ci = val;
                  r.si = mapping.si;
                }
                parsedData.push(r);
              }
            }
          });
        });

        if (parsedData.length > 0) {
          setData(parsedData);
        }
      } catch (err) {
        console.error("Failed to parse file:", err);
        alert("Failed to parse file. Ensure it is a valid CSV/Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const addRow = () => {
    const newRow: any = { id: Math.random().toString(36).substr(2, 9) };
    methodConfig.columns.forEach((col) => {
      newRow[col.key] =
        col.type === "number"
          ? col.key === "lat"
            ? 30
            : col.key === "lng"
              ? 78
              : 0
          : "";
    });
    setData([...data, newRow]);
  };

  const removeRow = (id: string) => {
    setData(data.filter((row: any) => row.id !== id));
  };

  const updateCell = (id: string, key: string, value: string) => {
    setData(
      data.map((row: any) => {
        if (row.id === id) {
          return { ...row, [key]: value };
        }
        return row;
      }),
    );
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const rawDataSheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, rawDataSheet, "Raw Data");

    const summaryData = siteResults.map((res: WQIResult) => ({
      Site: res.site,
      Latitude: res.lat,
      Longitude: res.lng,
      WQI_Score: res.score.toFixed(2),
      Class: res.wqiClass,
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Results");

    XLSX.writeFile(wb, `WQI_Export_${methodConfig.id}.xlsx`);
  };

  const exportToPDF = async () => {
    // Exporting the entire workspace instead of just the dashboard so map is included
    const el = document.getElementById("export-container");
    if (!el) return;
    try {
      const imgData = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#f5f5f5",
        skipFonts: true,
        filter: (node) => {
          if (node.tagName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet') {
            if ((node as HTMLLinkElement).href.includes('fonts.googleapis.com')) return false;
          }
          return true;
        }
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (el.offsetHeight * pdfWidth) / el.offsetWidth;

      pdf.setFontSize(16);
      pdf.text(
        `HYDROQUALIX-4™ Report (${selectedMethod.toUpperCase()})`,
        10,
        15,
      );

      pdf.addImage(imgData, "PNG", 0, 20, pdfWidth, pdfHeight);
      pdf.save(`WQI_Layout_Export_${methodConfig.id}.pdf`);
    } catch (err) {
      console.error("Failed to export PDF", err);
    }
  };

  const exportGraphToPNG = async () => {
    const el = document.getElementById("export-container");
    if (!el) return;
    try {
      const dataURL = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#f5f5f5",
        skipFonts: true,
        filter: (node) => {
          if (node.tagName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet') {
            if ((node as HTMLLinkElement).href.includes('fonts.googleapis.com')) return false;
          }
          return true;
        }
      });
      const link = document.createElement("a");
      link.download = `HYDROQUALIX_View_${methodConfig.id}.png`;
      link.href = dataURL;
      link.click();
    } catch (err) {
      console.error("Failed to export PNG", err);
    }
  };

  const mapCenter: [number, number] = currentResult
    ? [currentResult.lat || 20, currentResult.lng || 78]
    : [20, 78];

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-800 font-sans flex flex-col">
      <header className="bg-gradient-to-r from-slate-900 via-[#0a485c] to-[#04667a] text-white px-6 py-4 flex flex-col md:flex-row items-center justify-between sticky top-0 z-20 gap-4 shadow-lg border-b border-cyan-800/40">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 transition-transform duration-300 hover:scale-105 cursor-pointer flex items-center justify-center p-1 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 shadow-inner">
            <img
              src="/Hydro_48.png"
              alt="HYDROQUALIX-4 Logo"
              className="w-full h-full object-contain drop-shadow-lg transition-all duration-1000 ease-in-out hover:rotate-[360deg] hover:scale-110"
            />
          </div>
          <div>
            <h1 className="font-bold text-xl leading-tight tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-br from-white to-cyan-200">
              HYDROQUALIX-4&trade;
            </h1>
            <p className="text-xs text-cyan-100/80 font-medium tracking-wide uppercase mt-0.5">
              Multi-Method Water Quality Index Spreadsheet Automation Engine
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setIsAiAssistantOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-md hover:from-cyan-500 hover:to-blue-500 transition-all shadow-md shadow-cyan-900/20 border border-cyan-400/30"
          >
            <Sparkles className="w-4 h-4 text-cyan-100" />
            Gemini AI Assistant
          </button>
          <label className="text-sm font-medium flex items-center gap-2 text-cyan-50 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-md border border-white/20 transition-colors hover:bg-white/20 focus-within:bg-white/20">
            <Layers className="w-4 h-4 text-cyan-300" />
            RS Interpolation:
            <select
              className="bg-transparent border-none text-white font-semibold focus:ring-0 cursor-pointer outline-none ml-1 appearance-none min-w-[60px]"
              value={interpMethod}
              onChange={(e) => setInterpMethod(e.target.value as any)}
            >
              <option className="text-slate-900" value="none">None</option>
              <option className="text-slate-900" value="idw">IDW</option>
              <option className="text-slate-900" value="kriging">Kriging (Spherical)</option>
              <option className="text-slate-900" value="rbf">RBF</option>
            </select>
          </label>

          <div className="flex bg-white/10 backdrop-blur-md rounded-md p-1 border border-white/20">
            <button
              onClick={exportToExcel}
              className="p-1.5 text-cyan-100 hover:text-white hover:bg-white/20 rounded transition-all tooltip-trigger"
              title="Export to Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            <button
              onClick={exportToPDF}
              className="p-1.5 text-cyan-100 hover:text-white hover:bg-white/20 rounded transition-all tooltip-trigger"
              title="Export to PDF"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={exportGraphToPNG}
              className="p-1.5 text-cyan-100 hover:text-white hover:bg-white/20 rounded transition-all tooltip-trigger"
              title="Export Graph to PNG"
            >
              <FileImage className="w-4 h-4" />
            </button>
          </div>

          <label className="text-sm font-medium flex items-center gap-2 text-cyan-50 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-md border border-white/20 transition-colors hover:bg-white/20 focus-within:bg-white/20">
            <Settings2 className="w-4 h-4 text-cyan-300" />
            Method:
            <select
              className="bg-transparent border-none text-white font-semibold focus:ring-0 cursor-pointer outline-none ml-1 appearance-none max-w-[120px]"
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value as MethodId)}
            >
              {Object.values(wqiMethods).map((m) => (
                <option className="text-slate-900" key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setIsMethodInfoModalOpen(true)}
            className="p-1.5 text-cyan-100 bg-white/10 border border-white/20 hover:text-white hover:bg-white/20 rounded-md transition-all shadow-sm"
            title="Method Information & WQI Categories"
          >
            <Info className="w-4 h-4 pl-[0.5px]" />
          </button>
        </div>
      </header>

      <main
        id="export-container"
        className="flex-1 max-w-[1400px] w-full mx-auto p-6 flex flex-col gap-6 bg-[#f4f7fb] pb-12"
      >
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          {/* Left Column: Data & Map */}
          <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-blue-100/60 overflow-hidden flex flex-col h-[400px] transition-shadow hover:shadow-[0_8px_30px_rgba(4,102,122,0.06)]">
            <div className="px-5 py-3 border-b border-blue-50 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-cyan-50/30">
              <div className="flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-cyan-600" />
                <h2 className="font-bold text-slate-800 text-sm tracking-wide uppercase">
                  Mapping Window
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const el = document.getElementById("map-container-export");
                    if (!el) return;
                    try {
                      const dataURL = await toPng(el, {
                        cacheBust: true,
                        pixelRatio: 2,
                        backgroundColor: "#ffffff",
                        skipFonts: true,
                        filter: (node) => {
                          if (node.tagName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet') {
                            if ((node as HTMLLinkElement).href.includes('fonts.googleapis.com')) return false;
                          }
                          return true;
                        }
                      });
                      const link = document.createElement("a");
                      link.download = `Map_Export_${methodConfig.id}.png`;
                      link.href = dataURL;
                      link.click();
                    } catch (err) {
                      console.error("Failed to export Map as PNG", err);
                      alert("Failed to capture map. Some tile layers might block cross-origin requests.");
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 hover:border-cyan-300 transition-all shadow-sm"
                  title="Export Map"
                >
                  <Download className="w-3 h-3" />
                  Export Map
                </button>
                <input
                  type="file"
                  accept=".kml,.zip"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm"
                >
                  <Upload className="w-3 h-3" />
                  Import Boundary (KML/SHP)
                </button>
              </div>
            </div>
            <div id="map-container-export" className="flex-1 relative z-0">
              <MapContainer
                center={mapCenter}
                zoom={6}
                preferCanvas={true}
                style={{ height: "100%", width: "100%", zIndex: 1 }}
              >
                <InterpolationOverlay
                  methodId={selectedMethod}
                  interpMethod={interpMethod}
                  geojson={importedGeoJson}
                  points={siteResults.map((r) => ({
                    lat: r.lat,
                    lng: r.lng,
                    score: r.score,
                  }))}
                />
                {importedGeoJson && (
                  <GeoJSON
                    key={JSON.stringify(importedGeoJson).substring(0, 50)}
                    data={importedGeoJson}
                    style={{ color: "#10b981", weight: 2, fillOpacity: 0.2 }}
                  />
                )}
                <LayersControl position="topright">
                  <LayersControl.BaseLayer checked name="Carto Light">
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      attribution="&copy; OpenStreetMap &copy; CARTO"
                      maxZoom={19}
                      crossOrigin="anonymous"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="OpenStreetMap">
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; OpenStreetMap contributors"
                      maxZoom={19}
                      crossOrigin="anonymous"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Elevation / Topo">
                    <TileLayer
                      url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                      attribution="Map data: &copy; OSM, SRTM | Map style: &copy; OpenTopoMap"
                      maxZoom={17}
                      crossOrigin="anonymous"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Satellite (Esri)">
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri"
                      maxZoom={19}
                      crossOrigin="anonymous"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Google Streets">
                    <TileLayer
                      url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                      attribution="&copy; Google"
                      maxZoom={20}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Google Satellite">
                    <TileLayer
                      url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                      attribution="&copy; Google"
                      maxZoom={20}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Google Terrain">
                    <TileLayer
                      url="https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
                      attribution="&copy; Google"
                      maxZoom={20}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Bhuvan (ISRO)">
                    <WMSTileLayer
                      url="https://bhuvan-vec1.nrsc.gov.in/bhuvan/gwc/service/wms"
                      layers="india3"
                      format="image/png"
                      transparent={true}
                      attribution="Bhuvan &copy; NRSC, ISRO"
                      maxZoom={19}
                    />
                  </LayersControl.BaseLayer>
                </LayersControl>
                <MapUpdater center={mapCenter} />
                {siteResults.map((res, i) => {
                  const icon = L.divIcon({
                    className: "custom-site-icon",
                    html: `<div style="background-color: ${res.color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3); outline: 2px solid ${res.site === currentResult?.site ? "#000" : "transparent"}; transition: all 0.2s ease;"></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                  });

                  return (
                    <Marker
                      key={`${res.site}-${i}`}
                      position={[res.lat || 0, res.lng || 0]}
                      icon={icon}
                      eventHandlers={{ click: () => setActiveSite(res.site) }}
                    >
                      <Popup>
                        <div className="text-center pb-1">
                          <strong className="block text-sm mb-1">
                            {res.site}
                          </strong>
                          <span
                            className="px-2 py-0.5 rounded text-xs text-white"
                            style={{ backgroundColor: res.color }}
                          >
                            {res.wqiClass} (Score: {res.score.toFixed(1)})
                          </span>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-blue-100/60 overflow-hidden flex flex-col transition-shadow hover:shadow-[0_8px_30px_rgba(4,102,122,0.06)]">
            <div className="px-5 py-4 border-b border-blue-50 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-cyan-50/30">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Table className="w-5 h-5 text-cyan-600" />
                Data Input
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  ref={csvInputRef}
                  onChange={handleDataImport}
                  className="hidden"
                />
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="text-xs font-semibold bg-white border border-cyan-200 hover:border-cyan-400 hover:text-cyan-800 text-cyan-700 transition-all px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Import CSV/Excel
                </button>
                <button
                  onClick={addRow}
                  className="text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border border-transparent text-white transition-all px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm shadow-cyan-900/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 border-b border-blue-100 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="w-12 px-4 py-3 font-semibold text-center text-slate-400 border-r border-blue-50/50">
                      #
                    </th>
                    {methodConfig.columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-3 font-semibold border-r border-blue-50/50 last:border-r-0"
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="w-12 px-4 py-3 font-semibold text-center text-slate-400"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {data.map((row: any, i) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "group hover:bg-cyan-50/30 transition-colors",
                        activeSite === row.site && "bg-cyan-50/60",
                      )}
                      onClick={() => setActiveSite(row.site)}
                    >
                      <td className="px-4 py-2 border-r border-slate-100 text-center text-slate-400 font-mono text-xs cursor-pointer">
                        {i + 1}
                      </td>
                      {methodConfig.columns.map((col) => (
                        <td
                          key={col.key}
                          className="p-0 border-r border-slate-100 last:border-r-0 relative"
                        >
                          <input
                            type={col.type === "number" ? "number" : "text"}
                            value={row[col.key] ?? ""}
                            onChange={(e) =>
                              updateCell(row.id, col.key, e.target.value)
                            }
                            className={cn(
                              "w-full h-full min-h-[40px] px-4 py-2 bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-cyan-500 transition-all focus:relative z-10",
                              col.type === "number" &&
                                "font-mono text-right tabular-nums text-slate-700",
                              col.key === "site" && "font-medium",
                            )}
                            placeholder={col.type === "number" ? "0" : "..."}
                            step={col.type === "number" ? "any" : undefined}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRow(row.id);
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100 shadow-sm shadow-transparent hover:shadow-red-900/10"
                          title="Remove row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td
                        colSpan={methodConfig.columns.length + 2}
                        className="px-6 py-12 text-center text-slate-400"
                      >
                        <p>No data entered. Click "Add Row" to begin.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 text-slate-800 p-5 rounded-2xl border border-blue-100/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] text-sm flex gap-4 leading-relaxed mt-2 transition-shadow hover:shadow-[0_8px_30px_rgba(4,102,122,0.06)]">
            <Info className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1 text-slate-900">{methodConfig.name} Protocol</p>
              <p className="text-slate-600/90">{methodConfig.description}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Site Selection & Results Panel */}
        <div className="flex flex-col gap-6 sticky top-24">
          {/* Site Selector / List Summary */}
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-blue-100/60 overflow-hidden flex flex-col transition-shadow hover:shadow-[0_8px_30px_rgba(4,102,122,0.06)]">
            <h3 className="text-xs font-bold tracking-wide uppercase text-slate-500 px-5 py-3 border-b border-blue-50 bg-gradient-to-r from-blue-50/50 to-cyan-50/30">
              Sample Sites Overview
            </h3>
            <div className="divide-y divide-slate-100/50 max-h-[300px] overflow-y-auto">
              {siteResults.map((res) => (
                <button
                  key={res.site}
                  onClick={() => setActiveSite(res.site)}
                  className={cn(
                    "w-full text-left px-5 py-3 flex items-center justify-between hover:bg-cyan-50/30 transition-colors",
                    currentResult?.site === res.site && "bg-cyan-50/60",
                  )}
                >
                  <div>
                    <div className="font-medium text-sm text-slate-800">
                      {res.site}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {methodConfig.id.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{
                        backgroundColor: `${res.color}20`,
                        color: res.color,
                      }}
                    >
                      {res.wqiClass}
                    </span>
                    <span className="font-mono text-xs mt-1 text-slate-600 font-semibold">
                      {res.score.toFixed(1)}
                    </span>
                  </div>
                </button>
              ))}
              {siteResults.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No sites available
                </div>
              )}
            </div>
          </div>

          {currentResult ? (
            <div id="dashboard-panel" className="flex flex-col gap-6">
              <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-blue-100/60 p-6 flex flex-col items-center text-center relative overflow-hidden transition-shadow hover:shadow-[0_8px_30px_rgba(4,102,122,0.06)]">
                <div
                  className="absolute top-0 left-0 right-0 h-2"
                  style={{ backgroundColor: currentResult.color }}
                />
                <h3 className="text-sm font-bold tracking-wide text-slate-800 mb-1 line-clamp-1">
                  {currentResult.site}
                </h3>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-6">
                  WQI Score
                </p>

                <div className="relative flex items-center justify-center w-48 h-48 mb-4">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      className="text-slate-50"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke={currentResult.color}
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray="552.92"
                      strokeDashoffset={
                        552.92 -
                        (552.92 *
                          Math.min(Math.max(currentResult.score, 0), 100)) /
                          100
                      }
                      className="transition-all duration-1000 ease-out"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="flex flex-col items-center justify-center relative z-10">
                    <span
                      className="text-5xl font-bold tracking-tighter"
                      style={{ color: currentResult.color }}
                    >
                      {currentResult.score.toFixed(1)}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 mt-1 uppercase">
                      Index
                    </span>
                  </div>
                </div>

                <div
                  className="px-6 py-2 rounded-full text-lg font-bold shadow-sm"
                  style={{
                    backgroundColor: `${currentResult.color}15`,
                    color: currentResult.color,
                  }}
                >
                  {currentResult.wqiClass}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-blue-100/60 p-5 transition-shadow hover:shadow-[0_8px_30px_rgba(4,102,122,0.06)]">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-500 mb-4">
                  Parameter Impacts
                </h3>
                {currentResult.contributions.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={currentResult.contributions}
                        layout="vertical"
                        margin={{ top: 0, right: 0, left: 30, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke="#e5e5e5"
                        />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#737373", fontSize: 11 }}
                          width={80}
                        />
                        <RechartsTooltip
                          cursor={{ fill: "#f5f5f5" }}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          }}
                          labelStyle={{
                            fontWeight: "bold",
                            color: "#171717",
                            marginBottom: "4px",
                          }}
                          formatter={(val: number) => [
                            val.toFixed(2),
                            "Score Impact",
                          ]}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {currentResult.contributions.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={currentResult.color}
                              fillOpacity={0.8 + (index % 3) * 0.1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 border-2 border-dashed border-neutral-100 rounded-lg flex items-center justify-center text-neutral-400 text-sm">
                    No measurable data
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white/80 rounded-2xl shadow-sm border border-blue-100/60 p-12 text-center text-slate-400 backdrop-blur-sm">
              No site selected. Add data and click on a site to view its index
              score.
            </div>
          )}
        </div>
        </div>

        <ReportsGenerator siteResults={siteResults} data={data} methodConfig={methodConfig} />
      </main>

      <footer className="bg-gradient-to-r from-slate-900 via-[#0a485c] to-[#04667a] border-t border-cyan-800/40 px-6 py-6 mt-auto">
        <div className="max-w-[1400px] mx-auto text-center">
          <div className="text-[10px] text-cyan-50/70 leading-relaxed space-y-1">
            <p>Copyright &copy; 2026 Narendra Kumar. All rights reserved.</p>
            <p>HYDROQUALIX-4&trade; is a POLIPIXEL LAB trademark.</p>
            <p><strong>Version:</strong> 1.0.0 &nbsp;&nbsp; <strong>Last Updated:</strong> June 2026</p>
            <p className="mt-2 text-[9px] text-cyan-100/60">
              <strong>Citation:</strong> Kumar, N. (2026). HYDROQUALIX-4&trade;: Multi-Method Water Quality Index Spreadsheet Automation Engine (Version 1.0). POLIPIXEL LAB, Department of Geography, School of Earth Sciences, HNBGU. Zenodo. <a href="https://doi.org/10.5281/zenodo.20616816" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-white transition-colors">https://doi.org/10.5281/zenodo.20616816</a>.
            </p>
            <p className="font-bold text-[9px] mt-2 text-cyan-100/80">
              Current Date & Time: {currentDateTime.toLocaleDateString()} {currentDateTime.toLocaleTimeString()}
            </p>
          </div>
        </div>
      </footer>
      <MethodInfoModal 
        isOpen={isMethodInfoModalOpen} 
        onClose={() => setIsMethodInfoModalOpen(false)} 
        methodId={selectedMethod} 
      />
      <AiAssistant 
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        contextData={{
          method: methodConfig.name,
          siteResults: siteResults,
          rawData: data
        }}
      />
    </div>
  );
}
