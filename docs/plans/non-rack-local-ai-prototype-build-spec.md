# Non-Rack Local AI Prototype Build Spec

Status: Phase 0 discovery/specification
Date: 2026-06-09
Budget target: USD 100,000-150,000
Feature fit: Local AI Infrastructure Sizing

## Purpose

Define a quote-ready, non-server-rack floor prototype for KDTIX local AI infrastructure. This build is intended to support shadow mode, canary routing, benchmark collection, and partial local migration for Repo Automation workloads. It is not intended to replace all hosted provider traffic on day one.

## Recommendation

Use the proposed WRX90 workstation architecture as a new hardware catalogue profile:

`floor_proto_custom_wrx90_quad_rtxpro6000_maxq`

Recommended report classification:

- Phase: `floor_proto`
- Form factor: super-tower / floor workstation
- Routing strategy: partial local hybrid
- Safe initial workload: short-context coding, local shadow mode, canary worker tasks
- Cloud fallback required: repo-agent reviewer, high-risk architecture/security review, p95/p99 long-context sessions, failed local confidence checks
- Pricing confidence: quote required

This custom build is feasible under the USD 150,000 ceiling if GPU street/quote pricing lands near current workstation-channel ranges. It becomes tight if all four GPUs are quoted at the high end, if 1 TB+ RDIMM is selected, or if a professional integrator adds multi-year support and burn-in.

## Sourced Component Baseline

### Motherboard

ASUS Pro WS WRX90E-SAGE SE

Relevant verified specs:

- AMD sTR5 for Threadripper PRO 9000 and 7000 WX-series CPUs
- EEB workstation motherboard
- 8 DDR5 ECC Registered DIMM slots, 8-channel memory architecture
- Up to 2 TB ECC R-DIMM memory, subject to CPU/memory configuration and QVL
- 6 PCIe 5.0 x16 slots plus 1 PCIe 5.0 x16 slot in x8 mode
- 4 PCIe 5.0 M.2 slots
- 2 SlimSAS PCIe 4.0 x4 NVMe-capable ports
- 4 SATA 6 Gb/s ports
- AMD RAIDXpert2 PCIe RAID 0/1/5/10 and SATA RAID 0/1/5/10
- Intel dual 10 Gb Ethernet plus dedicated management LAN for AST2600 BMC

Source: https://www.asus.com/us/motherboards-components/motherboards/workstation/pro-ws-wrx90e-sage-se/
Source: https://shop.asus.com/us/90mb1fw0-muvay0-pro-ws-wrx90e-sage-se.html

### CPU

Recommended quote options:

- Preferred balance: AMD Ryzen Threadripper PRO 7975WX or 7985WX
- Maximum workstation headroom: AMD Ryzen Threadripper PRO 7995WX
- Future/upgrade quote option: Threadripper PRO 9000 WX-series if availability and motherboard BIOS support are confirmed

Rationale:

- LLM inference is GPU-heavy; the CPU primarily feeds GPUs, handles tokenization, tool orchestration, builds, indexing, compression, logging, and concurrent workers.
- A 96-core CPU is attractive for Repo Automation build/test lanes but is not required solely for four GPUs.
- If the choice is 96-core CPU vs 1 TB RAM, prefer more RAM for local AI infrastructure unless CPU-heavy build/test workloads are proven.

Indicative public price reference for 7995WX: CDW listed AMD Ryzen Threadripper PRO 7995WX at USD 10,573.99 on its product page printed 2026-06-09. Quote pricing may differ.

Source: https://www.cdw.com/product/amd-ryzen-threadripper-pro-7995wx-2.5-ghz-processor-pib-wof/7798068

### Memory

User-proposed kit:

G.SKILL F5-6400R3848F64GE8-T5N

Verified specs:

- T5 Neo DDR5 R-DIMM
- DDR5-6400 CL38-48-48-102
- 512 GB, 8 x 64 GB
- 1.35 V
- AMD EXPO
- ECC support
- Registered / buffered RDIMM

Recommendation:

- 512 GB is the minimum viable configuration for 4 x 96 GB GPUs because it exceeds total GPU VRAM.
- 1 TB is preferred because NVIDIA/PNY guidance recommends system memory at least equal to GPU memory, with twice GPU memory recommended. Four 96 GB GPUs means 384 GB total VRAM, so 768 GB+ system RAM is the better target.
- Confirm ASUS QVL compatibility before purchase. If stability is more important than EXPO speed, quote JEDEC/server-grade ECC RDIMM alternatives at 5600-6400 MT/s.

Source: https://www.gskill.com/product/400/452/1755678629/F5-6400R3848F64GE8-T5N
Source: https://www.newegg.com/g-skill-256gb-4-x-64gb/p/N82E16820374778

### GPUs

User-proposed GPU:

4 x NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition

Verified specs:

- NVIDIA Blackwell architecture
- 96 GB GDDR7 ECC per GPU
- 384 GB aggregate GPU memory across four cards
- 24,064 CUDA cores per GPU
- 752 Tensor cores per GPU
- PCIe 5.0 x16
- FHFL dual-slot form factor
- 300 W max power consumption per GPU
- Blower active fan
- 1 x PCIe CEM5 16-pin power connector per GPU

Important caveat:

The four GPUs do not create one 384 GB unified memory pool. Treat this as 4 x 96 GB with PCIe multi-GPU parallelism. Without NVLink/NVSwitch, large-model tensor parallelism over PCIe can be materially slower than an HGX/DGX-style NVLink system. This is still excellent for parallel serving, local shadow runs, route-specific workers, and benchmark collection.

Sources:
https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000-max-q/
https://www.pny.com/nvidia-rtx-pro-6000-blackwell-max-q

### Storage

User-proposed SSD:

4 x Samsung 9100 PRO 2 TB PCIe 5.0 x4 M.2 2280

Verified specs:

- M.2 2280
- PCIe 5.0 x4 NVMe
- Up to 14,700 MB/s sequential read for 2 TB
- Up to 13,400 MB/s sequential write for 2 TB
- Up to 1,850K random read IOPS
- Up to 2,600K random write IOPS

Recommendation:

- For a first prototype, use RAID10 or mirrored pairs rather than RAID0.
- 4 x 2 TB gives 8 TB raw and about 4 TB usable in RAID10, which may be tight for model weights, benchmark captures, traces, logs, artifacts, and replay corpora.
- Preferred quote: 4 x 4 TB or 4 x 8 TB if budget allows.
- Keep OS/logs separate from scratch/model-cache if possible.

Source: https://download.semiconductor.samsung.com/resources/data-sheet/Samsung_NVMe_SSD_9100_PRO_Datasheet_Rev.1.0.pdf
Source: https://www.newegg.com/samsung-2tb-9100-pro-nvme-2-0/p/N82E16820147903

## Mechanical / Chassis Recommendation

Hard requirement:

- EEB/SSI-EEB motherboard support
- At least 8 usable expansion slots for 4 dual-slot GPUs
- Prefer 10-11 rear expansion slots for cable and spacing tolerance
- Direct high-volume front-to-back airflow over blower GPUs
- Support for dual or redundant high-wattage PSUs
- Physical clearance for four FHFL dual-slot cards

Candidate chassis classes:

- Best practical non-rack floor prototype: large SSI-EEB super tower with 10-11 slots
- Conservative integrator choice: 4U GPU chassis configured as tower/floor system
- Avoid: normal full towers with 7 or 8 slots unless validated with this exact board and four dual-slot cards

Candidate examples to quote or validate:

- Phanteks Enthoo Pro 2 Server Edition: SSI-EEB support and 11 PCI slots
- Thermaltake Core W200: 10 expansion slots and extreme internal volume
- Supermicro CSE-747BTQ-R2K04B class: 4U/full-tower chassis, 11 full-height/full-length slots optimized for 4 double-width GPUs, 2000 W redundant Titanium PSU
- Exxact/Puget/vendor-validated 4 x RTX PRO 6000 Max-Q workstation configuration

Sources:
https://phanteks.com/product/enthoo-pro-2-server-edition-tg/
https://thermaltakeusa.com/products/core-w200-ca-1f5-00f1wn-00
https://www.supermicro.com/en/products/chassis/4u/747/sc747btq-r2k04b
https://www.exxactcorp.com/blog/news/exxact-validates-4x-nvidia-rtx-pro-6000-blackwell-max-q-in-a-workstation

## Power Budget

Estimated sustained component draw:

| Component | Estimate |
|---|---:|
| 4 x RTX PRO 6000 Blackwell Max-Q | 1,200 W |
| Threadripper PRO CPU | 280-350 W |
| Motherboard, RAM, M.2, NIC, fans, pumps | 250-450 W |
| Sustained system estimate | 1.7-2.0 kW |
| Peak / transient planning target | 2.2-2.5 kW |

Recommendation:

- Do not design this around a normal 120 V / 15 A outlet.
- Require dedicated 208-240 V power.
- Prefer 240 V / 20 A minimum; 240 V / 30 A preferred for headroom.
- PSU target: 2.4 kW class or dual/redundant 1600-2000 W Titanium units.
- Use native PCIe CEM5 / 12V-2x6 / 16-pin GPU power cabling, one dedicated cable per GPU. Do not split one cable across multiple GPUs.
- Confirm PSU output rating at the planned voltage. Some high-wattage PSUs derate on 120 V.

Heat:

- 2.0 kW sustained heat is roughly 6,800 BTU/hr.
- 2.5 kW peak planning is roughly 8,500 BTU/hr.
- Treat room HVAC and noise as procurement blockers, not afterthoughts.

## Cooling

Recommended cooling approach:

- CPU: 360 mm or 420 mm AIO, or custom loop if the builder has workstation burn-in experience.
- GPUs: keep blower air cooling for the Max-Q cards unless an integrator provides a supported water-cooled configuration.
- Case: high static-pressure intake, clear front-to-back GPU airflow, filtered intake, and validated exhaust clearance.

Water cooling note:

Water cooling is reasonable for the CPU. Full GPU water cooling is not the preferred first prototype path unless quoted by a professional integrator with warranty, leak testing, service plan, and replacement terms. The Max-Q cards are already 300 W blower cards, which is exactly why they fit this non-rack prototype better than 600 W server-oriented variants.

## Network

Minimum:

- Onboard dual 10 GbE for development and local lab use

Preferred:

- Add 25 GbE or 100 GbE NIC for shared model store, NAS, artifact cache, or future multi-node work
- Isolate management LAN/BMC from data plane

## Budget Envelope

All pricing is estimate-only until vendor quotes are collected.

| Area | Low Estimate | High Estimate | Notes |
|---|---:|---:|---|
| 4 x RTX PRO 6000 Blackwell Max-Q | $34,000 | $68,000 | Public estimates vary widely; quote required |
| Threadripper PRO CPU | $3,000 | $11,000 | Depends on 7975WX/7985WX/7995WX choice |
| ASUS WRX90 motherboard | $1,200 | $1,800 | Public retailer range |
| 512 GB-1 TB ECC RDIMM | $8,000 | $30,000 | G.SKILL 512 GB kit can be expensive; QVL alternatives required |
| NVMe storage | $1,200 | $5,000 | 4 x 2 TB minimum; prefer 4 TB/8 TB if budget allows |
| Chassis, PSU, cooling, fans | $3,500 | $12,000 | Depends on super tower vs redundant 4U/tower chassis |
| 25/100 GbE NIC and cabling | $800 | $3,000 | Optional for first lab build, preferred for shared infra |
| Integrator burn-in, warranty, spares | $8,000 | $25,000 | Strongly recommended |
| Estimated total | $59,700 | $155,800 | Keep config discipline to stay below $150k |

Best-fit quote target:

- Aim for $95K-$135K with 512 GB RAM, 4 x 2-4 TB NVMe, high-airflow tower/4U-floor chassis, and professional burn-in.
- If selecting 1 TB RAM and enterprise support, expect $120K-$150K.
- If GPU quote exceeds $15K/card, reduce to 2 GPUs for Phase 0 or move to a vendor 4U server quote.

## First-Server Report Classification

This profile should be reported as:

- Preferred first quote: yes, for custom non-rack prototype
- Full local replacement: no
- Partial migration: yes
- Shadow/canary readiness: yes after benchmark plan passes
- Production worker readiness: not until replay benchmarks and quality gates pass
- Cloud fallback required: yes

Expected route coverage:

| Route class | Initial routing |
|---|---|
| short_context_coding | local shadow, then local canary |
| repo_agent_worker | hybrid after benchmarks |
| repo_agent_reviewer | cloud first, local only for low-risk checks later |
| long_context_tail | cloud |
| realtime_or_transcription | separate benchmark required |
| unknown_or_untrusted | shadow only |

Initial local coverage target:

- Phase 0: 0% production local, shadow only
- Phase 1: 0-10% production local, low-risk canary
- Phase 2: 10-30% local for short-context coding and low-risk worker tasks
- Phase 3: 30-60% only after quality metrics prove local worker + cloud reviewer is safe

## Procurement Questions

Ask vendors/builders:

1. Can you validate the exact ASUS WRX90E-SAGE SE board with four RTX PRO 6000 Blackwell Max-Q cards?
2. Does the selected case expose enough rear slots for four dual-slot FHFL GPUs?
3. Is every GPU electrically running at PCIe 5.0 x16, or is any slot x8?
4. Are all GPU power cables native 16-pin / 12V-2x6 / CEM5 cables with no splitters?
5. What input power is required at full sustained load?
6. Is 240 V required for full PSU output?
7. What is the measured wall power during 4-GPU burn-in?
8. What is the measured GPU temperature and hotspot temperature after 24-hour load?
9. Can the builder provide Ubuntu + NVIDIA driver + CUDA + vLLM + TensorRT-LLM validation?
10. Is the memory kit on ASUS QVL for WRX90E-SAGE SE with the selected CPU?
11. Is the quote using workstation Max-Q GPUs or server/datacenter GPUs?
12. Is MIG supported and exposed in drivers for this SKU?
13. Is NVLink/NVSwitch present? Expected answer for this build is no.
14. What support SLA is included?
15. What is the return/restocking policy if four-GPU stability fails?

## Benchmark Plan Before Production Routing

Required before moving real provider traffic:

- Replay anonymized local Codex/Claude sessions
- Shadow current provider requests without making production decisions
- Measure TTFT, tokens/sec, p50/p95/p99 latency, success rate, tool-call correctness, diff quality, and reviewer acceptance
- Compare cloud worker + cloud reviewer against local worker + cloud reviewer
- Track memory pressure from cache-read-heavy workloads
- Measure per-route capacity, not a single misleading lane number
- Export benchmark results to `public/data/benchmarks/local-hardware/latest.json`

Minimum pass criteria:

- Short-context local worker quality is acceptable under cloud reviewer
- p95 latency is acceptable for developer workflows
- Failure detection routes back to cloud automatically
- Long-context tail remains cloud-routed until measured local evidence says otherwise

## Implementation Hook For Local AI Infrastructure Sizing

Add this custom profile to the hardware catalogue with:

```ts
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
  estimatedSystemPowerKw: 2.0,
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
  sourceUrls: [
    "https://www.asus.com/us/motherboards-components/motherboards/workstation/pro-ws-wrx90e-sage-se/",
    "https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000-max-q/",
    "https://www.pny.com/nvidia-rtx-pro-6000-blackwell-max-q",
    "https://www.gskill.com/product/400/452/1755678629/F5-6400R3848F64GE8-T5N",
    "https://download.semiconductor.samsung.com/resources/data-sheet/Samsung_NVMe_SSD_9100_PRO_Datasheet_Rev.1.0.pdf"
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
  notes: "Best fit for a non-rack KDTIX floor prototype under $150K. Use for partial local migration, benchmark collection, and canary routing; do not position as a full hosted-provider replacement."
}
```
