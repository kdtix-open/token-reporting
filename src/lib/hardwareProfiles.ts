export type HardwarePhase =
  | "floor_proto"
  | "pilot_server"
  | "production_node"
  | "rack_scale"
  | "cage_scale";

export type HardwareCooling = "air" | "liquid" | "facility_dependent" | "unknown";
export type HardwareInterconnect =
  | "PCIe"
  | "NVLink"
  | "NVSwitch"
  | "NVLink Rack Domain"
  | "unknown";
export type HardwarePricingConfidence =
  | "quote_required"
  | "public_estimate"
  | "internal_quote"
  | "unknown";
export type HardwareQuotePriority = "do_not_quote_yet" | "quote_later" | "quote_now";
export type HardwareFirstServerRole =
  | "canary"
  | "production_lane"
  | "rack_scale"
  | "shadow"
  | "worker_pool";

export interface HardwareProfile {
  id: string;
  vendor: string;
  quoteSku: string;
  profileName: string;
  phase: HardwarePhase;
  formFactor: string;
  rackUnits: number | null;
  gpuType: string;
  gpuArchitecture: string;
  gpuCount: number;
  vramGbPerGpu: number;
  totalVramGb: number;
  gpuPowerWEach: number | null;
  estimatedSystemPowerKw: number | null;
  cooling: HardwareCooling;
  nvlink: boolean;
  interconnect: HardwareInterconnect;
  cpu: string;
  systemRamGb: number;
  nvmeTb: number;
  network: string[];
  os: string[];
  servingStacks: string[];
  estimatedCapexLowUsd: number | null;
  estimatedCapexHighUsd: number | null;
  pricingConfidence: HardwarePricingConfidence;
  quotePriority: HardwareQuotePriority;
  firstServerRole: HardwareFirstServerRole;
  maxSafeInitialRoutingPct: number;
  fullProjectLaneClaimAllowed: boolean;
  analystNarrative: string;
  sourceUrls: string[];
  facilitiesNotes: string[];
  procurementQuestions: string[];
  notes: string;
}

export const HARDWARE_PROFILES: HardwareProfile[] = [
  {
    id: "floor_proto_dual_rtxpro6000_blackwell_server",
    vendor: "NVIDIA partner / OEM quote",
    quoteSku: "2U-2X-RTXPRO6000-BLACKWELL-SERVER",
    profileName: "Floor Prototype - dual RTX PRO 6000 Blackwell Server Edition",
    phase: "floor_proto",
    formFactor: "2U if vendor-validated, otherwise 4U floor system",
    rackUnits: 2,
    gpuType: "NVIDIA RTX PRO 6000 Blackwell Server Edition",
    gpuArchitecture: "Blackwell",
    gpuCount: 2,
    vramGbPerGpu: 96,
    totalVramGb: 192,
    gpuPowerWEach: 600,
    estimatedSystemPowerKw: 1.8,
    cooling: "air",
    nvlink: false,
    interconnect: "PCIe",
    cpu: "AMD EPYC / Xeon / Threadripper PRO class",
    systemRamGb: 512,
    nvmeTb: 8,
    network: ["25GbE minimum", "100GbE preferred"],
    os: ["Ubuntu 24.04 LTS"],
    servingStacks: ["vLLM", "TensorRT-LLM", "Ollama/llama.cpp for harness only"],
    estimatedCapexLowUsd: 70000,
    estimatedCapexHighUsd: 120000,
    pricingConfidence: "quote_required",
    quotePriority: "quote_now",
    firstServerRole: "shadow",
    maxSafeInitialRoutingPct: 10,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Quote A: strict-budget 2U dual RTX PRO 6000 shadow/canary server. Do not claim one full project lane before benchmarks.",
    sourceUrls: ["https://www.nvidia.com/en-us/products/workstations/"],
    facilitiesNotes: [
      "Confirm 208-240V power before purchase.",
      "Treat as local shadow/canary capacity, not full migration capacity."
    ],
    procurementQuestions: [
      "Can the vendor validate this exact GPU count for 24-hour inference burn-in?",
      "Are GPUs server SKUs and are vLLM/TensorRT-LLM configs validated?"
    ],
    notes:
      "Fallback first-server quote when four Blackwell GPUs cannot fit the first budget."
  },
  {
    id: "preferred_quad_rtxpro6000_blackwell_server",
    vendor: "NVIDIA partner / Dell / Supermicro / Lambda / Exxact quote",
    quoteSku: "4U-5U-4X-RTXPRO6000-BLACKWELL-SERVER",
    profileName: "Preferred First Server - quad RTX PRO 6000 Blackwell Server Edition",
    phase: "pilot_server",
    formFactor: "4U/5U GPU server",
    rackUnits: 4,
    gpuType: "NVIDIA RTX PRO 6000 Blackwell Server Edition",
    gpuArchitecture: "Blackwell",
    gpuCount: 4,
    vramGbPerGpu: 96,
    totalVramGb: 384,
    gpuPowerWEach: 600,
    estimatedSystemPowerKw: 3.2,
    cooling: "air",
    nvlink: false,
    interconnect: "PCIe",
    cpu: "Dual EPYC / Xeon or Threadripper PRO class",
    systemRamGb: 1024,
    nvmeTb: 16,
    network: ["dual 25GbE minimum", "100GbE preferred"],
    os: ["Ubuntu 24.04 LTS"],
    servingStacks: ["vLLM", "TensorRT-LLM", "Ollama/llama.cpp for harness only"],
    estimatedCapexLowUsd: 105000,
    estimatedCapexHighUsd: 150000,
    pricingConfidence: "quote_required",
    quotePriority: "quote_now",
    firstServerRole: "worker_pool",
    maxSafeInitialRoutingPct: 10,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Quote B: preferred first serious local worker-pool quote if the vendor can fit the budget or financing is approved; still benchmark-gated.",
    sourceUrls: ["https://www.nvidia.com/en-us/products/workstations/"],
    facilitiesNotes: [
      "Confirm power draw and air handling with vendor; 3kW+ class systems may require data-center style planning.",
      "Use as first serious worker pool only after shadow/canary benchmarks pass."
    ],
    procurementQuestions: [
      "Is this a validated four-GPU server configuration?",
      "What support SLA and replacement terms are included?",
      "Are NVIDIA AI Enterprise, CUDA, vLLM, and TensorRT-LLM validated?"
    ],
    notes:
      "Primary first serious worker-pool quote target; do not claim one full Repo Automation lane until benchmarks prove it."
  },
  {
    id: "production_8x_rtxpro6000_blackwell_server",
    vendor: "NVIDIA partner / Dell / Supermicro / Lambda / Exxact quote",
    quoteSku: "4U-8U-8X-RTXPRO6000-BLACKWELL-SERVER",
    profileName: "Quote C - 8x RTX PRO 6000 Blackwell Server Edition production candidate",
    phase: "production_node",
    formFactor: "4U/6U/8U 8-GPU server",
    rackUnits: 6,
    gpuType: "NVIDIA RTX PRO 6000 Blackwell Server Edition",
    gpuArchitecture: "Blackwell",
    gpuCount: 8,
    vramGbPerGpu: 96,
    totalVramGb: 768,
    gpuPowerWEach: 600,
    estimatedSystemPowerKw: 6.5,
    cooling: "air",
    nvlink: false,
    interconnect: "PCIe",
    cpu: "Dual EPYC / Xeon server platform",
    systemRamGb: 2048,
    nvmeTb: 30,
    network: ["dual 25GbE minimum", "100GbE preferred"],
    os: ["Ubuntu 24.04 LTS", "vendor-supported AI OS image"],
    servingStacks: ["vLLM", "TensorRT-LLM", "NVIDIA NIM where supported"],
    estimatedCapexLowUsd: null,
    estimatedCapexHighUsd: null,
    pricingConfidence: "quote_required",
    quotePriority: "quote_later",
    firstServerRole: "production_lane",
    maxSafeInitialRoutingPct: 30,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Quote C: first real production-node candidate if the 4-GPU quote cannot sustain enough measured lane capacity. Quote after shadow/canary evidence.",
    sourceUrls: ["https://www.nvidia.com/en-us/products/workstations/"],
    facilitiesNotes: [
      "Requires rack, power, and air-handling review before purchase.",
      "Do not treat as approved first purchase without measured 4-GPU shortfall evidence."
    ],
    procurementQuestions: [
      "Can the chassis run 8 RTX PRO 6000 Server Edition GPUs at sustained inference load?",
      "Can the vendor populate 4 GPUs now and expand to 8 later?",
      "What thermal, acoustic, and power derating applies under 24-hour inference?"
    ],
    notes:
      "Production candidate for expanding beyond first-server worker-pool measurements; quote required."
  },
  {
    id: "floor_proto_custom_wrx90_quad_rtxpro6000_maxq",
    vendor: "Custom / integrator quote",
    quoteSku: "ASUS-WRX90-4X-RTXPRO6000BQ",
    profileName: "Custom WRX90 quad RTX PRO 6000 Blackwell Max-Q floor prototype",
    phase: "floor_proto",
    formFactor: "Super-tower / floor workstation",
    rackUnits: null,
    gpuType: "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
    gpuArchitecture: "Blackwell",
    gpuCount: 4,
    vramGbPerGpu: 96,
    totalVramGb: 384,
    gpuPowerWEach: 300,
    estimatedSystemPowerKw: 2,
    cooling: "air",
    nvlink: false,
    interconnect: "PCIe",
    cpu: "AMD Ryzen Threadripper PRO 7000/9000 WX-series",
    systemRamGb: 512,
    nvmeTb: 8,
    network: ["dual 10GbE onboard", "25/100GbE optional"],
    os: ["Ubuntu 24.04 LTS", "Windows 11 Pro for Workstations optional"],
    servingStacks: ["vLLM", "TensorRT-LLM", "llama.cpp/Ollama for harness"],
    estimatedCapexLowUsd: 95000,
    estimatedCapexHighUsd: 150000,
    pricingConfidence: "quote_required",
    quotePriority: "quote_now",
    firstServerRole: "canary",
    maxSafeInitialRoutingPct: 10,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Custom floor prototype candidate for controlled migration and benchmarks; not a direct workload replacement claim.",
    sourceUrls: [
      "https://www.asus.com/us/motherboards-components/motherboards/workstation/pro-ws-wrx90e-sage-se/",
      "https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000-max-q/",
      "https://www.pny.com/nvidia-rtx-pro-6000-blackwell-max-q",
      "https://www.gskill.com/product/400/452/1755678629/F5-6400R3848F64GE8-T5N"
    ],
    facilitiesNotes: [
      "Require dedicated 208-240V circuit; 240V/30A preferred.",
      "Plan for roughly 2.0kW sustained and 2.5kW peak.",
      "Plan for 6,800-8,500 BTU/hr heat load.",
      "Expect workstation/server-class noise under load."
    ],
    procurementQuestions: [
      "Validate four-GPU mechanical fit and 24-hour burn-in.",
      "Confirm native 16-pin cabling per GPU.",
      "Confirm memory QVL and stability with selected CPU.",
      "Confirm driver, CUDA, vLLM, and TensorRT-LLM validation."
    ],
    notes:
      "Best fit for a non-rack KDTIX floor prototype under $150K; use for partial local migration and benchmark collection."
  },
  {
    id: "budget_l40s_or_rtx6000ada_pcie",
    vendor: "NVIDIA partner / used or new OEM quote",
    quoteSku: "2U-4U-L40S-RTX6000ADA-48GB",
    profileName: "Budget Alternative - L40S / RTX 6000 Ada PCIe server",
    phase: "floor_proto",
    formFactor: "2U/4U PCIe GPU server",
    rackUnits: 4,
    gpuType: "NVIDIA L40S or RTX 6000 Ada",
    gpuArchitecture: "Ada Lovelace",
    gpuCount: 4,
    vramGbPerGpu: 48,
    totalVramGb: 192,
    gpuPowerWEach: 300,
    estimatedSystemPowerKw: 2,
    cooling: "air",
    nvlink: false,
    interconnect: "PCIe",
    cpu: "EPYC / Xeon / Threadripper PRO class",
    systemRamGb: 512,
    nvmeTb: 8,
    network: ["25GbE minimum"],
    os: ["Ubuntu 24.04 LTS"],
    servingStacks: ["vLLM", "TensorRT-LLM", "Ollama/llama.cpp for harness only"],
    estimatedCapexLowUsd: 45000,
    estimatedCapexHighUsd: 95000,
    pricingConfidence: "quote_required",
    quotePriority: "quote_later",
    firstServerRole: "canary",
    maxSafeInitialRoutingPct: 5,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Budget proof-of-concept only for short-context benchmarks. Not suitable for 1M-context pressure.",
    sourceUrls: ["https://www.nvidia.com/en-us/design-visualization/rtx-6000/"],
    facilitiesNotes: ["Short-context only; do not use for 1M-context pressure."],
    procurementQuestions: [
      "Are these new, warrantied GPUs?",
      "Can the vendor prove sufficient context and throughput for the benchmark plan?"
    ],
    notes:
      "Lower-cost proof-of-concept only; not preferred for p99 context or 1M-token workloads."
  },
  {
    id: "production_node_hgx_h200_b200_8gpu",
    vendor: "Dell / NVIDIA / Supermicro / Lambda quote",
    quoteSku: "8X-HGX-H200-B200-NVLINK",
    profileName: "Production Node - 8x H200 or B200 NVLink server",
    phase: "production_node",
    formFactor: "HGX/DGX-class rack server",
    rackUnits: 8,
    gpuType: "NVIDIA H200 or B200",
    gpuArchitecture: "Hopper / Blackwell",
    gpuCount: 8,
    vramGbPerGpu: 141,
    totalVramGb: 1128,
    gpuPowerWEach: 700,
    estimatedSystemPowerKw: 10,
    cooling: "liquid",
    nvlink: true,
    interconnect: "NVSwitch",
    cpu: "Dual high-core-count EPYC / Xeon",
    systemRamGb: 2048,
    nvmeTb: 30,
    network: ["100GbE minimum", "400GbE preferred"],
    os: ["Ubuntu 24.04 LTS", "vendor-supported AI OS image"],
    servingStacks: ["vLLM", "TensorRT-LLM", "NVIDIA NIM"],
    estimatedCapexLowUsd: null,
    estimatedCapexHighUsd: null,
    pricingConfidence: "quote_required",
    quotePriority: "quote_later",
    firstServerRole: "production_lane",
    maxSafeInitialRoutingPct: 30,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Production node tier for later scale-up, not the first $150K purchase; requires facilities and support review.",
    sourceUrls: ["https://www.nvidia.com/en-us/data-center/"],
    facilitiesNotes: [
      "Production-node tier; requires rack power/cooling planning and support contract.",
      "Not the first $150K floor prototype."
    ],
    procurementQuestions: [
      "What rack units, power feeds, cooling, and support SLA are required?",
      "Does the quote include NVLink/NVSwitch topology and validation?"
    ],
    notes:
      "Scale-up production node when local lanes or cloud displacement justify capex."
  },
  {
    id: "rack_scale_gb200_nvl72",
    vendor: "NVIDIA / cloud-scale OEM quote",
    quoteSku: "GB200-NVL72",
    profileName: "Rack Scale - GB200 NVL72",
    phase: "rack_scale",
    formFactor: "48U rack-scale NVLink domain",
    rackUnits: 48,
    gpuType: "NVIDIA GB200 NVL72",
    gpuArchitecture: "Blackwell",
    gpuCount: 72,
    vramGbPerGpu: 192,
    totalVramGb: 13824,
    gpuPowerWEach: null,
    estimatedSystemPowerKw: null,
    cooling: "facility_dependent",
    nvlink: true,
    interconnect: "NVLink Rack Domain",
    cpu: "36 Grace CPUs",
    systemRamGb: 0,
    nvmeTb: 0,
    network: ["400GbE / InfiniBand quote required"],
    os: ["vendor-supported AI OS image"],
    servingStacks: ["NVIDIA NIM", "TensorRT-LLM", "enterprise scheduler"],
    estimatedCapexLowUsd: null,
    estimatedCapexHighUsd: null,
    pricingConfidence: "quote_required",
    quotePriority: "do_not_quote_yet",
    firstServerRole: "rack_scale",
    maxSafeInitialRoutingPct: 0,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Rack-scale target only. Use for strategic facility planning, not first-server procurement.",
    sourceUrls: ["https://www.nvidia.com/en-us/data-center/gb200-nvl72/"],
    facilitiesNotes: [
      "Scale target only; requires high-density rack power, liquid cooling, and cage planning."
    ],
    procurementQuestions: [
      "What data center prerequisites, power density, and liquid cooling are required?"
    ],
    notes: "Rack-scale target, not a first-server recommendation."
  },
  {
    id: "future_rubin_class_unquoted",
    vendor: "Future NVIDIA ecosystem",
    quoteSku: "RUBIN-CLASS-UNQUOTED",
    profileName: "Future / Unquoted - Rubin-class platform",
    phase: "cage_scale",
    formFactor: "Future platform",
    rackUnits: null,
    gpuType: "Rubin-class GPU",
    gpuArchitecture: "Rubin",
    gpuCount: 0,
    vramGbPerGpu: 0,
    totalVramGb: 0,
    gpuPowerWEach: null,
    estimatedSystemPowerKw: null,
    cooling: "unknown",
    nvlink: true,
    interconnect: "unknown",
    cpu: "future",
    systemRamGb: 0,
    nvmeTb: 0,
    network: [],
    os: [],
    servingStacks: [],
    estimatedCapexLowUsd: null,
    estimatedCapexHighUsd: null,
    pricingConfidence: "unknown",
    quotePriority: "do_not_quote_yet",
    firstServerRole: "rack_scale",
    maxSafeInitialRoutingPct: 0,
    fullProjectLaneClaimAllowed: false,
    analystNarrative:
      "Future/unquoted placeholder. Never recommend as current quoteable hardware.",
    sourceUrls: [],
    facilitiesNotes: ["Future/unquoted only; do not use for first-server recommendation."],
    procurementQuestions: ["Revisit when public quoteable configurations exist."],
    notes: "Placeholder for future planning only."
  }
];
