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

import { wqiMethods, MethodId, WQIResult } from "./utils/wqi";
import { cn } from "./utils/cn";
import {
  InterpolationOverlay,
  SpatialPoint,
} from "./components/InterpolationOverlay";
import { MethodInfoModal } from "./components/MethodInfoModal";

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

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
    // Reset file input so same file can be uploaded again if needed
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
            parseFloat(row["Lat"] || row["Latitude"] || row["latitude"]) || 0;
          const lng =
            parseFloat(
              row["Lng"] || row["Long"] || row["Longitude"] || row["longitude"],
            ) || 0;

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
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 relative w-12 h-12">
            <div className="bg-emerald-500 absolute inset-0 rounded-md text-white shadow-sm shadow-emerald-500/20 flex items-center justify-center">
              <Calculator className="w-6 h-6" />
            </div>
            <img
              src="/WQI.png"
              alt="HYDROQUALIX-4 Logo"
              className="w-full h-full object-contain relative z-10 bg-white rounded-md"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight">
              HYDROQUALIX-4&trade;
            </h1>
            <p className="text-xs text-neutral-500 font-medium tracking-wide uppercase">
              Multi-Method Water Quality Index Spreadsheet Automation Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium flex items-center gap-2 text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-md border border-neutral-200">
            <Layers className="w-4 h-4 text-emerald-500" />
            RS Interpolation:
            <select
              className="bg-transparent border-none text-neutral-900 font-semibold focus:ring-0 cursor-pointer outline-none ml-1"
              value={interpMethod}
              onChange={(e) => setInterpMethod(e.target.value as any)}
            >
              <option value="none">None</option>
              <option value="idw">IDW</option>
              <option value="kriging">Kriging (Spherical)</option>
              <option value="rbf">RBF</option>
            </select>
          </label>

          <div className="flex bg-neutral-100 rounded-md p-1 border border-neutral-200">
            <button
              onClick={exportToExcel}
              className="p-1.5 text-neutral-600 hover:text-emerald-600 hover:bg-white rounded transition-colors tooltip-trigger"
              title="Export to Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            <button
              onClick={exportToPDF}
              className="p-1.5 text-neutral-600 hover:text-red-500 hover:bg-white rounded transition-colors tooltip-trigger"
              title="Export to PDF"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={exportGraphToPNG}
              className="p-1.5 text-neutral-600 hover:text-blue-500 hover:bg-white rounded transition-colors tooltip-trigger"
              title="Export Graph to PNG"
            >
              <FileImage className="w-4 h-4" />
            </button>
          </div>

          <label className="text-sm font-medium flex items-center gap-2 text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-md border border-neutral-200">
            <Settings2 className="w-4 h-4 text-neutral-400" />
            Method:
            <select
              className="bg-transparent border-none text-neutral-900 font-semibold focus:ring-0 cursor-pointer outline-none ml-1"
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value as MethodId)}
            >
              {Object.values(wqiMethods).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setIsMethodInfoModalOpen(true)}
            className="p-1.5 text-neutral-600 bg-neutral-100 border border-neutral-200 hover:text-emerald-600 hover:border-emerald-300 rounded-md transition-colors"
            title="Method Information & WQI Categories"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main
        id="export-container"
        className="flex-1 max-w-[1400px] w-full mx-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6 items-start bg-neutral-50 pb-12"
      >
        {/* Left Column: Data & Map */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col h-[400px]">
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-neutral-500" />
                <h2 className="font-semibold text-neutral-800 text-sm tracking-wide uppercase">
                  Mapping Window
                </h2>
              </div>
              <div>
                <input
                  type="file"
                  accept=".kml"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Import KML
                </button>
              </div>
            </div>
            <div className="flex-1 relative z-0">
              <MapContainer
                center={mapCenter}
                zoom={6}
                style={{ height: "100%", width: "100%" }}
              >
                <InterpolationOverlay
                  methodId={selectedMethod}
                  interpMethod={interpMethod}
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
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="OpenStreetMap">
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; OpenStreetMap contributors"
                      maxZoom={19}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Elevation / Topo">
                    <TileLayer
                      url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                      attribution="Map data: &copy; OSM, SRTM | Map style: &copy; OpenTopoMap"
                      maxZoom={17}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Satellite (Esri)">
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri"
                      maxZoom={19}
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

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <h2 className="font-semibold text-neutral-800 flex items-center gap-2">
                <Table className="w-4 h-4 text-neutral-500" />
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
                  className="text-xs font-medium bg-white border border-neutral-200 hover:border-emerald-300 hover:text-emerald-700 text-neutral-600 transition-colors px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Import CSV/Excel
                </button>
                <button
                  onClick={addRow}
                  className="text-xs font-medium bg-emerald-600 border border-emerald-600 hover:bg-emerald-700 hover:border-emerald-700 text-white transition-colors px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="w-12 px-4 py-3 font-medium text-center text-neutral-400 border-r border-neutral-200">
                      #
                    </th>
                    {methodConfig.columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-3 font-medium border-r border-neutral-200 last:border-r-0"
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="w-12 px-4 py-3 font-medium text-center text-neutral-400"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.map((row: any, i) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "group hover:bg-emerald-50/30 transition-colors",
                        activeSite === row.site && "bg-emerald-50/50",
                      )}
                      onClick={() => setActiveSite(row.site)}
                    >
                      <td className="px-4 py-2 border-r border-neutral-100 text-center text-neutral-400 font-mono text-xs cursor-pointer">
                        {i + 1}
                      </td>
                      {methodConfig.columns.map((col) => (
                        <td
                          key={col.key}
                          className="p-0 border-r border-neutral-100 last:border-r-0 relative"
                        >
                          <input
                            type={col.type === "number" ? "number" : "text"}
                            value={row[col.key] ?? ""}
                            onChange={(e) =>
                              updateCell(row.id, col.key, e.target.value)
                            }
                            className={cn(
                              "w-full h-full min-h-[40px] px-4 py-2 bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-500 transition-all focus:relative z-10",
                              col.type === "number" &&
                                "font-mono text-right tabular-nums text-neutral-700",
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
                          className="p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
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
                        className="px-6 py-12 text-center text-neutral-400"
                      >
                        <p>No data entered. Click "Add Row" to begin.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100 text-sm flex gap-3 leading-relaxed shadow-sm">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">{methodConfig.name} Protocol</p>
              <p className="text-blue-700/80">{methodConfig.description}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Site Selection & Results Panel */}
        <div className="flex flex-col gap-6 sticky top-24">
          {/* Site Selector / List Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col">
            <h3 className="text-xs font-bold tracking-wide uppercase text-neutral-400 px-5 py-3 border-b border-neutral-100 bg-neutral-50/50">
              Sample Sites Overview
            </h3>
            <div className="divide-y divide-neutral-100 max-h-[300px] overflow-y-auto">
              {siteResults.map((res) => (
                <button
                  key={res.site}
                  onClick={() => setActiveSite(res.site)}
                  className={cn(
                    "w-full text-left px-5 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors",
                    currentResult?.site === res.site && "bg-neutral-50",
                  )}
                >
                  <div>
                    <div className="font-medium text-sm text-neutral-800">
                      {res.site}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
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
                    <span className="font-mono text-xs mt-1 text-neutral-600 font-semibold">
                      {res.score.toFixed(1)}
                    </span>
                  </div>
                </button>
              ))}
              {siteResults.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-neutral-400">
                  No sites available
                </div>
              )}
            </div>
          </div>

          {currentResult ? (
            <div id="dashboard-panel" className="flex flex-col gap-6">
              <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-neutral-200 p-6 flex flex-col items-center text-center relative overflow-hidden">
                <div
                  className="absolute top-0 left-0 right-0 h-2"
                  style={{ backgroundColor: currentResult.color }}
                />
                <h3 className="text-sm font-semibold tracking-wide text-neutral-800 mb-1 line-clamp-1">
                  {currentResult.site}
                </h3>
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-6">
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
                      className="text-neutral-100"
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
                    <span className="text-xs font-semibold text-neutral-400 mt-1 uppercase">
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

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-500 mb-4">
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
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center text-neutral-400">
              No site selected. Add data and click on a site to view its index
              score.
            </div>
          )}
        </div>
      </main>

      <footer className="bg-white border-t border-neutral-200 px-6 py-4 mt-auto">
        <div className="max-w-[1400px] mx-auto text-center md:text-left">
          <p className="text-xs text-neutral-500 leading-relaxed text-center">
            <strong>Citation:</strong> Kumar, N. (2026). HydroQualix-4 Tool:
            Multi-Method Water Quality Index Spreadsheet Automation Engine
            (Version 1.0) [Computer software]. POLIPIXEL LAB, Department of
            Geography, School of Earth Sciences, Hemvati Nandan Bahuguna Garhwal
            University (A Central University). DOI/URL.
          </p>
        </div>
      </footer>
      <MethodInfoModal 
        isOpen={isMethodInfoModalOpen} 
        onClose={() => setIsMethodInfoModalOpen(false)} 
        methodId={selectedMethod} 
      />
    </div>
  );
}
