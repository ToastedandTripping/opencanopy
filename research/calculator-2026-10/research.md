# OpenCanopy carbon calculator research (2026-10-02) -- findings mirror

Plan mode switched on mid-run. The canonical file
/home/leesalo/marvin/research/opencanopy-calculator-20261002/research.md was created before that
(header + project constraints only). Plan mode forbids writing it, so findings are saved here as
they arrive. Once plan mode lifts, the "Raw findings log" below gets appended verbatim to research.md.

## Raw findings log

### F1. VRI rank-1 layer publishes per-ha biomass components
- Layer WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY; data dictionary v5 (2019):
  https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/stewardship/forest-analysis-inventory/data-management/standards/vegcomp_poly_rank1_data_dictionaryv5_2019.pdf
  Catalogue: https://catalogue.data.gov.bc.ca/dataset/2ebb35d8-c82f-4a17-9c96-612ac3532d55
- Field names (WHOLE_STEM_BIOMASS_PER_HA, BRANCH_..., FOLIAGE_..., BARK_...) to be confirmed against the dictionary (pending fetch).
- Derivation candidate: Boudewyn et al. 2007 volume-to-biomass models (CFS Info Rep BC-X-411) applied to VDYP volume.
  https://www.cclmportal.ca/node/4623 ; VDYP: https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/forest-inventory/growth-and-yield-modelling/variable-density-yield-projection-vdyp

### F2. VERIFIED live: the four biomass fields exist on the public WFS (2026-10-02)
- DescribeFeatureType on https://openmaps.gov.bc.ca/geo/pub/wfs typeName=WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY
  returns WHOLE_STEM_BIOMASS_PER_HA, BRANCH_BIOMASS_PER_HA, FOLIAGE_BIOMASS_PER_HA, BARK_BIOMASS_PER_HA
  (the 2019 dictionary spells it "folliage_biomass_per_ha"; the live field is FOLIAGE_BIOMASS_PER_HA).
- Dictionary v5 (2019) definitions, verbatim: "total [whole stem|branch|foliage|bark] biomass per hectare of all
  species based on a utilization of 4.0cm expressed as tonnes/ha". Pages 5, 22, 79, 258.
- Also on the layer: LIVE_STAND_VOLUME_125/175/225, DEAD_STAND_VOLUME_125/175/225, per-species live/dead vol,
  STAND_PERCENTAGE_DEAD, VRI_DEAD_STEMS_PER_HA, BEC_ZONE_CODE/SUBZONE/VARIANT, CFS_ECOZONE, PROJ_AGE_1,
  HARVEST_DATE, PROJECTED_DATE, SPECIES_CD/PCT 1-6. NO soil, litter, dead-wood biomass or carbon fields.
- PROJECTED_DATE on all samples = 2025-12-31 (VDYP projection year).
- Sample values (dry tonnes/ha) pulled live 2026-10-02:
  - CWH, HW leading, age 275, live vol 797 m3/ha: stem 419, branch 60, foliage 25, bark 63 => sum 567 t/ha.
  - CWH, CW leading, age 381, 722 m3/ha: 343 / 63 / 25 / 50 => 481 t/ha.
  - SBS, B leading, age 250, 151 m3/ha: 89 / 26 / 16 / 14 => 145 t/ha.
  - IDF, FD leading, age 251, 166 m3/ha: 98 / 25 / 16 / 18 => 157 t/ha.
  - CWH age 16 stands: volume null and ALL FOUR biomass fields = 0 (one exception: FDC 4.5 m3/ha -> 29 t/ha).
- IMPLICATIONS:
  (a) Above-ground live tree biomass per polygon is a published government number; OpenCanopy need not invent
      a per-ha carbon density. Carbon = biomass x carbon fraction (see F-carbon-fraction).
  (b) Young stands report 0 biomass where VDYP gives no volume. 0 is an artefact, not a measurement; the tool
      must label these "below inventory volume threshold", not "zero carbon". Consistent with DECISIONS
      2026-09-02 (unknown contributes no value) but needs its own label.
  (c) DEAD_STAND_VOLUME_125 was null in every sample: standing dead is mostly unpopulated. Dead wood, litter,
      soil and below-ground are NOT in VRI and must come from a model or literature, with ranges.
  (d) Whether "whole stem" includes bark (double count risk) needs the derivation doc -- pending.

### F3. Derivation of the VRI biomass fields: partly verified
- Boudewyn, Song, Magnussen & Gillis 2007, "Model-based, volume-to-biomass conversion for forested and vegetated
  land in Canada", CFS Pacific Forestry Centre Inf. Rep. BC-X-411. Four above-ground components: stem wood, stem
  bark, branches, foliage. https://www.cclmportal.ca/node/4623 ; parameters since updated and served via NFI
  calculators https://nfi.nfis.org/en/biomass_models
- The four VRI fields map one-to-one onto Boudewyn's four components, and the dictionary calls bark its own
  field, so "whole stem" is most plausibly stemwood without bark and summing all four is not a double count.
  UNVERIFIED: no BC document found (two searches) stating that VDYP7 / the VRI biomass fields use Boudewyn
  equations. Ask FAIB (Forest Analysis and Inventory Branch) or read VDYP7 source before publishing this claim.
  Sanity check from live sample: CWH HW 797 m3/ha merch vol -> 419 t stem; implied 0.53 t/m3 against the
  4 cm whole-stem volume (larger than 12.5 cm merch vol), consistent with western hemlock basic density ~0.42
  plus top/stump volume. Plausible, not proof.

### F4. Below-ground and carbon fraction: CBM-CFS3 conventions (the national standard)
- CBM-CFS3 (Kurz et al. 2009, Ecological Modelling 220(4):480-504,
  https://ideas.repec.org/a/eee/ecomod/v220y2009i4p480-504.html) is the Tier-3 IPCC model behind Canada's NIR
  forest numbers; it converts merchantable volume to the four Boudewyn components, then derives roots, dead
  organic matter and soil pools. NRCan page: https://natural-resources.canada.ca/climate-change/climate-change-impacts-forests/carbon-budget-model
- Biomass-to-carbon conversion in CBM-CFS3: 0.5 (default `bRateBiomassToCarbon = 0.5` in the CBMutils port of
  CBM's routines, https://predictiveecology.r-universe.dev/CBMutils/doc/manual.html). IPCC 2006 GL default for
  temperate conifers is 0.51 and general default 0.47 (IPCC 2006 Vol.4 Ch.4 Table 4.3) -- UNVERIFIED in this
  session from the IPCC PDF; cite only after fetching. For a floor-when-in-doubt tool, 0.47 is the
  conservative choice and 0.5 the national-model-consistent one; publish which.
- Root biomass, Li, Kurz, Apps & Beukema 2003, CJFR 33(1):126-136, https://cdnsciencepub.com/doi/full/10.1139/x02-165
  (635 paired above/below-ground observations). Parameters as implemented in CBMutils `calcRootC`:
  softwood total root biomass = 0.222 x AGB (t/ha); hardwood = 1.576 x AGB^0.615;
  fine-root proportion = 0.072 + 0.354 x exp(-0.060212 x total root biomass); fine-root turnover 0.641/yr.
  => For a softwood stand, below-ground live = 22.2% of above-ground live biomass. This is a deterministic,
     citable, reproducible add-on to the VRI biomass fields.
- Dead wood, litter, soil: CBM-CFS3 initialises DOM/soil pools by a "spin-up" of repeated historical
  stand-replacing disturbances (fire in all Canadian spatial units) until DOM stabilises (CBMutils manual,
  same URL). That means CBM DOM/soil values for a polygon are MODEL STATE, not observations, and depend on
  assumed historic disturbance interval. Usable only as a labelled model output with a range.

### F5. Field-measured BC ecosystem carbon (ranges, for validating VRI-derived estimates)
- Coastal Forest Chronosequence, Vancouver Island CWH (Trofymow; project page https://cfs.nrcan.gc.ca/projects/75).
  AGU 2022 abstract (Trofymow, https://ui.adsabs.harvard.edu/abs/2022AGUFMSY41A..02T/abstract): live biomass C by
  2020 polynomial fit: 80-101 MgC/ha at ~29 yr; 225-250 at ~62 yr; 320-363 at ~110 yr; 382-540 MgC/ha in old
  growth (~201-445 yr). Soil C "did not significantly differ with stand age"; forest floor tended highest in OG.
  Overall trend for OG biomass slightly declining (two stands positive/neutral). CBM "generally matched" R and M
  stands but "tended to underestimate I and young O stands".
- Total ecosystem C (all pools incl. soil), coastal OG western hemlock: 417 MgC/ha east Vancouver Island
  (Trofymow et al. 2007), 532 MgC/ha west Vancouver Island (Trofymow & Blackwell 1998) -- as tabulated in
  DellaSala et al. 2022 Table 3 (below). Not read in the originals.
- Interior Cedar-Hemlock (inland rainforest), Matsuzaki thesis/2013 (UNBC; https://central.bac-lac.gc.ca/.item?app=Library&id=MR87589&oclc_number=903768391&op=pdf):
  uncut OG total forest C excluding mineral soil 455 +/- 156 MgC/ha (95% CI); live tree 76%, DOM 24%
  (snags 5, CWD 9, forest floor 10%). Clearcut units retained 99 +/- 14 MgC/ha (all DOM); group retention 160.
  Root C was 63 of 348 MgC/ha live (18% of live, 22% of above-ground) -- consistent with Li et al. softwood ratio.
- Sub-boreal spruce, Aleza Lake (Fredeen et al. 2005, CJFR, https://cdnsciencepub.com/doi/full/10.1139/x05-074):
  OG total 324-423 MgC/ha by soil texture; mineral soil to 1.07 m 106-115 MgC/ha and SIMILAR between OG and
  <20-yr second growth; harvest lowers total C by 41-54% (stock comparison, not a flux).
- DellaSala, Keith, et al. 2022, "Estimating carbon stocks and stock changes in Interior Wetbelt forests of
  British Columbia", Ecosphere (https://exa.ai/library/publication/k2xm38h9thq ; DOI to confirm). Built carbon maps
  FROM VRI + global soil map + 27 field plots. Key finding for OpenCanopy: "Vegetation Resources Inventory
  estimates were 75% lower than field-based measurements with the greatest mismatch in areas with the highest
  C density." VRI mean all-pool C 182 MgC/ha (soil ~40%, live stems ~27%); field OG plots mean 583, max 1275.
  => A VRI-based number is a FLOOR, especially for old growth. That suits the floor-when-in-doubt ruling but
     must be labelled as such ("inventory-based, likely an underestimate for old forest").
- Compilation table (oldgrowthforestecology.org, https://oldgrowthforestecology.org/wp-content/uploads/2022/03/table-1_carbon-stocks-coastal-interior-by-age.pdf):
  Simard et al. 2020 / Roach et al. 2021 CWHvm1, ICHdw1, IDFdm2 mature vs clearcut. Partially garbled in
  extraction; cite originals only.

### F6. Harvested wood products (HWP): what fraction of harvested carbon stays stored
- Dymond 2012, "Forest carbon in North America: annual storage and emissions from British Columbia's harvest,
  1965-2065", Carbon Balance and Management 7:8, doi:10.1186/1750-0680-7-8 (BC-HWPv1 model; BC government
  scientist). PDF: https://cbmjournal.biomedcentral.com/counter/pdf/10.1186/1750-0680-7-8.pdf . Read directly:
  - "about 40% of the harvested C is converted into long-lived products" (intro, p.2).
  - "after 150 years, 5.5% of the harvest was still in-use, primarily in single-family homes."
  - CO2-only emissions 1980-2010 "ranged from 48% to 60% of the harvest, with a median of 52%" => proposed BC
    emission factor 0.52 x annual harvest instead of IPCC default 1.0 (annual-flow accounting; NOT the share of a
    given block's carbon emitted over time).
  - 2010 harvest: instantaneous accounting 48 Mt CO2; cumulative 100-yr emissions from that harvest 31 Mt CO2e
    (incl. CH4, N2O), 11% below the BC offset protocol's 100-yr figure. => roughly 65% of HARVESTED (log) carbon
    emitted within 100 years, ~35% still stored, mostly in non-degradable landfill. (Derived by me from the two
    figures; treat as approximate. Landfill non-degradable fractions: wood 77%, paper 44% (degradable 23% / 56%).)
  - Uncertainty: 1965 emissions range 6.7-12 Mt CO2e across parameter extremes (roughly -35%/+15% around 10.5).
- BC government's own explainer (Dymond, "Common misconceptions", https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/tree-species-selection/misconceptions_forest_carbon.pdf):
  "For BC wood used domestically, approximately 25-40% of carbon harvested in BC is stored for a long period of
  time in products." HWP / landfill / avoided-emission estimates "have an uncertainty of more than 40%."
  "If the whole ecosystem is considered, there is more storage in the unmanaged stands than in managed stands."
- BC Carbon Calculator for Wood Products (gov.bc.ca, built on BC-HWPv1), user manual:
  https://www2.gov.bc.ca/assets/gov/environment/natural-resource-stewardship/nrs-climate-change/mitigation/users_manual_july_19_2016.pdf
  "in 2010, 84% of logs harvested went to sawmills and of this, 47% was actually turned into lumber, of which 25%
  went into single family homes." Reports storage at 100 yr with and without landfill.
- CRITICAL scoping point: these are percentages of the carbon in LOGS DELIVERED TO THE MILL (merchantable stem
  + bark), not of total stand carbon. Branches, foliage, tops, stumps, roots, understory, snags stay on site as
  slash/DOM (IPCC 2006 Vol.4 Ch.12: "Slash and other material left at harvest sites should be regarded as dead
  organic matter ... and not as HWP", https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_12_Ch12_HWP.pdf).
- National HWP parameters (Kurz, "Forest Carbon Estimation and Projections for British Columbia", USFS-hosted
  slides, https://research.fs.usda.gov/sites/default/files/2023-02/forest_carbon_estimation_and_projections_for_bc_by_werner_kurz.pdf):
  production approach; half-lives sawnwood 35 yr, other solid wood 35, panels 25, pulp & paper 2, bioenergy
  instant oxidation; harvest inputs from CBM-CFS3/NFCMARS, trade flows from FAO, half-lives from IPCC.
  IPCC 2006 Tier-1 defaults: solidwood 30 yr, paper 2 yr (k = ln2/HL); KP/2013 defaults: sawnwood 35, panels 25,
  paper 2.
- Canada's NIR carries HWP tables (half-lives Table A6.5-3 in NIR 2025 Part 2,
  https://unfccc.int/sites/default/files/resource/2025NIR%20-%20Part%202.pdf). Not read in detail this session.

### F7. BC's own forest-carbon method: TSR Carbon Modelling Guidance (FAIB, 25 April 2025) -- the template to copy
Source: https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/stewardship/forest-analysis-inventory/tsr-annual-allowable-cut/tsr_carbon_modeling_guidance_25_april_2025.pdf (read directly).
- Model: CBM-CFS3 driven by VDYP (natural stands, projected close-utilization volume PRJ_VOL_CU) and TIPSY
  (managed stands; TIPSY run 120 yr, volume at 120 repeated to 250). Growth curves "not altered for climate change".
- DOM/soil initialised by spin-up to equilibrium (slow DOM within 0.1%); historic disturbance assumed wildfire
  in the interior, insects on the coast. => soil/DOM per polygon are model equilibrium values.
- Harvest disturbance: interior = default CBM type 3 "Clearcut with slash-burn"; coast = same matrix modified so
  burning is halved (reduced coastal slash-burning). Appendix 3 matrix values (default -> coast):
  softwood merchantable: 85% to Products, 14.25% -> 14.625% to medium DOM, 0.75% -> 0.375% burned (CO2/CH4/CO);
  foliage, "other" (branches/tops), submerchantable: 90% -> 95% to DOM, 10% -> 5% burned; coarse roots 45%/47.5%
  to above-ground fast DOM, remainder below-ground DOM.
  => In the government's own model, a clearcut sends 85% of merchantable-stem carbon off site and leaves
     everything else (branches, foliage, tops, stumps, roots) on site to decay, minus a 5-10% direct burn.
- HWP: "follows the default method outlined in the 'British Columbia Greenhouse Gas Offset Protocol: Forest
  Carbon' (FCOP) (MECCS 2024). FCOP uses a 100-year retention factor of 6% (HWP_r) ... The rest is treated as
  transfers (HWP_t) to wood products (or as emissions in TSR)." Query: HWP_r = Production x 0.06 x 44/12.
  => BC's official 100-year HWP storage factor in TSR is 6% of harvested carbon; 94% treated as emitted.
     Contrast Dymond 2012 (~35% incl. landfill) and BC explainer (25-40% "long period"). The spread is mostly
     landfill inclusion and time horizon. Publish the government number as the floor and the range as context.
- NECB (net ecosystem carbon balance, CCFM SFM indicator 4.1.1): Growth - fire - decay - roads - SlashBurn -
  HWP_t + HWP_r. GWPs per Canada NGHGI.
- TSA-level default mean annual temperatures (climR, 1993-2022) given in Appendix 2 (e.g. Arrowsmith 8.36 C,
  Strathcona 7.88, Fort Nelson -0.58) -- CBM decay rates depend on MAT.
- Roads and landings: CBM disturbance 208 (deforestation). A cutblock's road/landing share is permanent
  forest loss in this framework.

### F8. Slash pile burning, BC
- BC Provincial GHG Inventory methodology (1990-2022) has a separate "Slash Pile Burning" line item: direct GHG
  from pile burning after clearcut, hazard-abatement burning, and site-prep burning.
  https://www2.gov.bc.ca/assets/gov/environment/climate-change/data/provincial-inventory/2022/provincial_inventory_of_greenhouse_gas_emissions_1990-2022_-_methodology_report.pdf
- BC government expectations doc: slash pile burning ~6% of BC annual GHG emissions; CleanBC Roadmap to 2030
  commits to "near elimination of slash pile burning by 2030".
  https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/cf_expectations_reduce_emissions_gov_funded_projects.pdf
- BC 2016 PIR: slash pile burning 4,634 kt CO2e (as cited in a U Calgary capstone,
  https://ucalgary.scholaris.ca/server/api/core/bitstreams/a857e9db-595d-4335-b990-29facc032dea/content -- secondary).
  The Narwhal (2020-05-23) reports "just under 4 million tonnes in 2017" from provincial data and notes it is
  excluded from the official total. https://thenarwhal.ca/up-in-smoke-b-c-backtracks-on-promise-to-deter-logging-industry-from-burning-wood-waste/
- BC FLNR slide deck (Watson, woody fibre): "1 m3 burned in a slash pile emits = .9 tCO2e".
  https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/timber-tenures/fibre-recovery/woody_fibre_forest_management.pdf
- Hember (BC FOR), silviculture mitigation methodology: pile burn = 90% combustion of carbon in pile pools,
  10% remnant decays as medium litter.
  https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/stewardship/forest-analysis-inventory/tsr-annual-allowable-cut/climate_change_mitigation_silviculture.pdf
- Per-block implication: WHETHER a given FOM block's slash will be piled and burned is not in the FOM API and is
  not knowable in advance. The tool can only show the BC TSR default assumption (5% coast / 10% interior of
  residue burned at harvest) or a labelled scenario ("if all piled residue is burned").

### F9. BC Forest Carbon Offset Protocol (FCOP) v2, 18 April 2024 -- read directly
Source: https://www2.gov.bc.ca/assets/gov/environment/climate-change/ind/protocol/bc_forest_carbon_offset_protocol.pdf
- HWP (s.8.1.2, p.49-50): HWPfact = 6%: "The proportion of CO2 remaining after harvest ... Assumed to be 6%
  permanently sequestered for a standard mix of products after 100 years." The factor "was provided by Natural
  Resources Canada and used in the National Inventory Report and excludes temporary storage." Landfill:
  "does not consider storage within landfills or dumps. HWP sent to landfill is conservatively assumed to be
  emitted as CO2 in this Protocol." Applies to delivered roundwood only.
- Carbon fraction: fC,wood = "50% for all wood species" (Eq. 8). => 0.5 is BC's regulatory convention too.
- Table 4, BC oven-dry stemwood densities (t/m3, inside bark): red alder 0.42, aspen 0.42, western redcedar 0.35,
  yellow cypress 0.45, Douglas-fir 0.50, true firs 0.40, western hemlock 0.47, western larch 0.64, lodgepole
  pine 0.46, ponderosa pine 0.46, spruce 0.43, Sitka spruce 0.41. (Table 5 green-wood values also given.)
  => Lets the tool convert VRI merchantable volume (or FOM planned volume, if any) to harvested carbon with a
     government parameter, independently of the VRI biomass fields (a cross-check).
- MARKET LEAKAGE, Table 8 (p.81), provincial defaults: Northern Interior 71.89%, Southern Interior 69.18%,
  Coast 47.37%. Derived from export supply price elasticity 0.31 and regional species substitutability (App. C).
  => BC's own protocol says that if a block is NOT logged, roughly half (coast) to ~70% (interior) of the
     foregone harvest is made up by harvest elsewhere. Any "avoided emissions if protected" claim that ignores
     leakage overstates by the protocol's own rules. This is the single strongest reason the current calculator
     framing ("stock x price = avoided emissions") is wrong, beyond the stock-vs-flux error.
- Monitoring / permanence: 100-year monitoring period; crediting period 25 years renewable (2021 webinar,
  https://www2.gov.bc.ca/assets/gov/environment/climate-change/offsets/offsets-portfolio/draftfcopwebinarppt_202104.pdf).
- Baseline for CONS/IFM on Crown land must follow FAIB TSR harvest-flow methods (so a credible "avoided harvest"
  baseline is a timber-supply projection, not "this block would certainly be cut").

### F10. Recovery and "payback" times after harvest (ranges, with their framing)
- Harmon, Ferrell & Franklin 1990, Science 247:699-702, doi:10.1126/science.247.4943.699
  (https://www.science.org/doi/10.1126/science.247.4943.699): PNW (Oregon/Washington) simulation; on-site carbon
  "does not approach old-growth storage capacity for at least 200 years"; even counting wooden buildings,
  harvest "results in a net flux of CO2 to the atmosphere". As summarised by Malcolm et al. 2020 (below):
  ~250 yr for temperate rainforest stands to regain stocks; >350 yr payback converting 450-yr forests to 60-yr
  plantations. Conversion of 5 Mha of PNW old growth added 1.5-1.8 Pg C to the atmosphere.
- Trofymow, Stinson & Kurz 2008, For. Ecol. Manage. 256:1677-1691, doi:10.1016/j.foreco.2008.02.056 (CBM-CFS3,
  2,500 ha Oyster River, Vancouver Island, 1920-2005): 1920 old-growth landscape a small sink (NBP 0.2 MgC/ha/yr);
  1930-45 logging + fire + slash burning NBP -3 to -56 MgC/ha/yr; source until mid-1950s; sink 3-6 MgC/ha/yr
  1960-87. "Despite their high productivity, the area's forests are not likely to attain C densities of the
  landscape prior to industrial logging because the stands will not reach pre-logging ages" (50-60-yr rotation).
  https://ui.adsabs.harvard.edu/abs/2008ForEM.256.1677T/abstract
- Fredeen et al. (2007), as cited in DellaSala et al. 2022: wetter sub-boreal clearcuts were net C emitters for
  8-10 years post-logging before returning to net uptake (i.e. the SINK flips back within a decade; the STOCK
  deficit lasts decades-centuries). Secondary citation; original not read.
- Mitchell, Harmon & O'Connell 2012, GCB Bioenergy 4:818-827 (https://research.fs.usda.gov/treesearch/47697):
  bioenergy context; clearcutting primary (old-growth) PNW landscapes gave payback >100 yr in all cases.
- Malcolm et al. 2020, boreal east-central Canada carbon debt (Climatic Change; PDF
  https://academic.daniels.utoronto.ca/forestry/wp-content/uploads/sites/4/2020/04/Malcolm_online_2020_Article_ForestHarvestingAndTheCarbonDe.pdf):
  payback >90 yr best case to >500 yr; documents that results swing on assumed old-stand volume dynamics and
  fire-return interval (Ter-Mikaelian et al. 2015 got 91 yr partly by assuming old-stand volume decline).
- Counter-position, must be presented: Kurz (CFS), BC slides (https://research.fs.usda.gov/sites/default/files/2023-02/forest_carbon_estimation_and_projections_for_bc_by_werner_kurz.pdf):
  "Simply 'conserving' forests will risk 'saturation' of C sinks (forest age) and increased risk of natural
  disturbances (in most regions)"; Xu et al. 2017: a regionally differentiated forest-management and wood-use
  portfolio could deliver 18.2 MtCO2e/yr (35% of BC's 2050 reduction target) at <$100/t. Note these are
  landscape/sector-level, substitution-inclusive results, and the old-growth-specific chronosequence evidence
  (Trofymow CFC: OG live biomass trending only slightly down; Harmon) cuts against "saturation" justifying
  harvest of old stands. Both framings are published; the tool should not adjudicate substitution.
- Kurz slides also give the BC 1990-2018 cumulative forest-sector balance: natural-disturbance-affected
  forests a source of 1,187 Mt CO2e; managed forest sink -2,029 (excluding ND); HWP emissions 1,178. (Slide
  numbers, preliminary; cite as such.)
- PER-BLOCK IMPLICATION: "Payback time" is not a single number. It depends on (i) counterfactual (protect vs
  harvest), (ii) HWP accounting (6% in-use FCOP vs ~35% incl. landfill Dymond), (iii) substitution (contested,
  excluded by FCOP), (iv) regrowth curve (TIPSY managed-stand yield, public), (v) rotation age. A defensible
  output is "time for the regrowing stand's carbon to equal what the clearcut removed/emitted, under BC TSR
  defaults", shown as a range across HWP assumptions, with explicit note that the stand is normally re-harvested
  before reaching old-growth stocks (Trofymow 2008).

### F11. Money: what BC forest carbon has actually traded for (government purchases, disclosed)
Source: BC Climate Action Secretariat, "Carbon Offset Portfolio Pricing 2014-forward" (updated through 22 May 2026):
https://www2.gov.bc.ca/assets/gov/environment/climate-change/offsets/pricing/carbon_offset_portfolio_pricing_2014-forward.pdf (read directly)
- Great Bear Carbon Credit LP (Forest Conservation / IFM; Haida Gwaii, North & Central-Mid Coast, South Central
  Coast): $12.00/t CO2e in every portfolio year 2020-21 through 2024-25 (e.g. 2020-21: 564,297 t HG for
  $6,771,564; 386,678 t NCC for $4,640,136; 316,992 t SCC for $3,803,904). 2025 portfolio (1 Jul 2025 - 22 May
  2026): $10.00/t (357,556 t HG for $3,575,560; also NCC and SCC).
- Cheakamus Community Forest Society (IFM, Whistler): $14.00/t (e.g. 31,135 t for $435,890 in 2024-25;
  34,954 t for $489,356 and 38,559 t for $539,826 in earlier years).
- Non-forest comparators in same table: fuel-switch $8.00-15.00/t.
- Historic: Pacific Carbon Trust resold to public-sector bodies at $25/t; the 2011 Darkwoods sale to PCT worked
  out to ~$5.70/t (The Tyee, 2011-07-22, https://thetyee.ca/Opinion/2011/07/22/StrangeOffsets/ -- journalism,
  derived figure). CBC (Great Bear): voluntary prices dipped "as low as $2 US per tonne", "current price is around
  $15"; "~$10 million of credits remain unsold each year" (https://www.cbc.ca/lite/story/1.7072839, date not
  captured -- UNVERIFIED date).
- OBPS market: IETA (Sept 2025) expected BC OBPS-eligible credits to trade at a 10-25% discount to the $80
  2024 price; 4.66 M eligible offsets issued, over half from Great Bear (Haida Gwaii).
  https://www.ieta.org/uploads/wp-content/2025/09/IETA-Business-brief-BC_Sept2025.pdf

### F12. Money: carbon prices and social cost
- BC consumer carbon tax: "eliminated effective April 1, 2025" (https://www2.gov.bc.ca/gov/content/taxes/sales-taxes/motor-fuel-carbon-tax/carbon-tax-elimination).
  => The old calculator's use of a "BC carbon tax" price (if any) is obsolete.
- BC OBPS (large industry, since 1 Apr 2024): compliance charge $80 (2024), $95 (2025), $110 (2026), +$15/yr
  to $170 (2030), per Brightspot (2024-08-30, https://brightspot.co/library/what-is-the-bc-output-based-pricing-system-and-what-does-it-mean-for-industry-in-british-columbia/)
  and IETA (Sept 2025). The government guidance's Table 3 (https://www2.gov.bc.ca/assets/gov/environment/climate-change/ind/obps/guidance/bc_obps_program_and_reporting_guidance.pdf)
  is an image and could not be text-verified; BC announced an independent CleanBC/OBPS review (May 2025).
  UNVERIFIED that the 2026 $110 rate is still in force after that review.
- ECCC Social Cost of GHG (interim updated guidance, effective 12 Dec 2022; C$2021, 2% near-term Ramsey):
  SC-CO2 $247 (2020), $271 (2025), $275 (2026), $294 (2030), $394 (2050); sensitivity 2.5% discount: $166
  (2025) / $170 (2026); 1.5%: $460 (2025) / $467 (2026).
  https://www.canada.ca/en/environment-climate-change/services/climate-change/science-research-data/social-cost-ghg.html
- APPLES-TO-ORANGES (the part the old calculator got wrong):
  (1) Offset price ($10-14/t) is what the BC government pays for a VERIFIED, ADDITIONAL, leakage-discounted,
      buffered, 100-yr-monitored tonne. A raw "tonnes of carbon standing in a polygon" figure is not a credit;
      multiplying stock by credit price prices something no buyer would pay for.
  (2) OBPS/compliance price is the marginal cost an emitter pays to emit a tonne; SCC is the estimated damage of
      a tonne. Both apply to an EMITTED tonne (flux), never to a STANDING stock.
  (3) Even for flux, protecting a block avoids only (emissions if harvested - emissions if protected) x
      (1 - leakage), and the timing matters (emissions spread over decades; SCC is year-specific).
  (4) The only defensible money framing: "the CO2 BC's own default method attributes to harvesting this block
      over 100 years, valued at the federal social cost of carbon, is $X-$Y (range across discount rates),
      before leakage" -- and label leakage explicitly. Even this is advocacy-adjacent; recommended as optional.

### F13. Money: stumpage (what the Crown is actually paid for the timber)
- Coast non-appraised tabular rates, effective 2026-10-01 (Coast Appraisal Manual Table 7-1, read directly):
  https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/timber-pricing/coast-timber-pricing/coast_non-appraised_tabular_rates_oct_26.pdf
  District average sawlog stumpage ($/m3): Coast Area AVG 5.88 (balsam 2.78, hemlock 4.60, cedar 8.11,
  cypress 2.85, fir 9.56); by district AVG: Chilliwack 2.94, Campbell River 4.45, Haida Gwaii 0.77, North Island-
  Central Coast 4.28, Sunshine Coast 12.55, South Island 11.20, Sea-to-Sky 4.66. Community forest/woodlot
  rates far lower (0.25-1.86). Index page (monthly PDFs): https://www2.gov.bc.ca/gov/content/industry/forestry/competitive-forest-industry/timber-pricing/coast-timber-pricing/coast-average-stumpage-rates
- Interior non-appraised tabular rates, Sept 2025 (Table 6-1, coniferous sawlog AVG $/m3): North Central 15.70,
  North East 6.07, Fort Nelson 4.98, North West 4.91, South Central 4.87, South East 18.31, South West 26.49.
  https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/timber-pricing/interior-timber-pricing/interior_non-appraised_tabular_rates_sept_25.pdf
  (Jan 2025 and Mar 2025 editions also exist; rates move monthly with lumber markets.)
- CAVEATS: these "tabular" rates apply to small/non-appraised cutting authorities and are district averages,
  not the appraised rate of a specific FOM block (each block is appraised under the Coast/Interior Appraisal
  Manual from cruise data that are not public at FOM stage). Stumpage is Crown rent, not the timber's market
  value or the economic activity it supports. Comparing "carbon $ vs stumpage $" is defensible only as "what the
  Crown receives in stumpage at the district average" and only with the volume the block would yield, which FOM
  does not give (see F-FOM). Rates are fully public and reproducible (monthly PDF), which suits DECISIONS.

### F14. FOM (Forest Operations Map) data: what a proposal actually carries -- VERIFIED live 2026-10-02
- Public WFS layers: WHSE_FOREST_TENURE.FOM_CUTBLOCK_SP, FOM_ROAD_SECTION_SP, FOM_WLDLFE_TREE_RETNTN_AREA_SP
  (openmaps.gov.bc.ca GetCapabilities). Catalogue: https://catalogue.data.gov.bc.ca/dataset/7dda4615-5d32-427e-a303-1dcdb90a6fea ;
  ArcGIS layer description: https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_forest_tenure/MapServer/32
- Cutblock fields: FOM_C_SYSID, FOM_ID, CUT_BLOCK_ID, NAME, PLANNED_DEVELOPMENT_DATE, PLANNED_AREA,
  FSP_HOLDER_NAME, LIFECYCLE_STATUS, CREATE_DATE, FEATURE_AREA_SQM, geometry. 50,242 cutblock features on
  2026-10-02. Newest sample: FOM 3515, West Fraser Mills Ltd., three "Proposed" blocks of 10.4-13.2 ha, planned
  development 2026-11-01.
- NOT in FOM: harvest volume, species/cruise, silviculture system (clearcut vs retention), slash disposal
  method, regeneration plan. Submission format (https://www2.gov.bc.ca/assets/gov/environment/natural-resource-policy-legislation/legislation-regulation/frpa-pac/frpa-information/fom_geospatial_submission_format_overview.pdf)
  requires only geometry + DEV_DATE (+ optional NAME) for cutblocks, roads and WTRAs (wildlife tree retention
  areas, which ARE published and should be subtracted from the block).
- FRPA FOM rules (https://www2.gov.bc.ca/gov/content/environment/natural-resource-stewardship/laws-policies-standards-guidance/legislation-regulation/forest-range-practices-act/frpa-improvement-initiative/forest-operations-map):
  30-day comment period; FOM may be relied on for 3 years; holder reports comments and changes to government.
  Shapes are "approximate location of proposed cutblocks" -- the final cutting permit boundary can change.
- Overlay feasibility test (bbox of block 70971 against VRI rank-1, read-only WFS): 12 VRI polygons returned,
  all MS dm; mixture of a 194-yr subalpine-fir stand (165 t/ha AG biomass), 104-134-yr spruce stands
  (~150-175 t/ha), 1988/2011-harvested pine (~40-70 t/ha), and one 2021-harvested polygon whose VRI attributes
  are all NULL. => The overlay works with public services today, BUT (a) a real tool must do true polygon
  intersection with area weighting (bbox over-selects); (b) VRI can be stale against recent harvest/fire (null
  or pre-disturbance attributes) -- must cross-check against the consolidated cutblocks layer and fire
  perimeters and label "inventory may predate recent disturbance"; (c) FOM blocks sometimes overlap
  already-harvested ground (salvage, block changes), so "carbon in this block" may be small or unknown.
- Worked illustration ONLY (not for publication): if block 70971 were wholly the 194-yr BL polygon,
  AG biomass 165.4 t/ha x 0.5 = 82.7 tC/ha; + roots (Li et al. softwood 0.222) 18.4 tC/ha => ~101 tC/ha live tree
  = ~371 t CO2/ha; x 12.09 ha => ~4,480 t CO2 in live trees. Under the BC TSR default matrix, ~85% of the
  merchantable-stem share leaves as logs; 6% of that is counted as stored at 100 yr under FCOP. Everything
  else is on-site DOM decaying over decades. This is the shape of an honest per-block statement.

### F15. Existing tools and analyses: what each gets right or wrong
1. Global Forest Watch carbon flux (Harris et al. 2021, Nature Climate Change, https://www.nature.com/articles/s41558-020-00976-6 ;
   revised Gibbs et al. 2025, ESSD 17:1217, https://essd.copernicus.org/articles/17/1217/2025/ ). 30 m, 2001-2023,
   gross emissions from stand-replacing disturbance (all pools incl. soil), removals, net; data CC-licensed on
   Harvard Dataverse (doi 10.7910/DVN/LNPSGP etc.).
   RIGHT: open, pixel-level, separates gross emissions from removals, now tracks HWP transfer.
   WRONG for BC old growth: emission factors from a year-2000 AGB map whose optical/radar inputs "saturate
   around 250 Mg ha-1 biomass" (Harris SI) -- coastal BC old growth runs ~480-570 t/ha in VRI alone (F2), so GFW
   understates the biggest stands. Uses Hansen tree-cover-loss, which records harvest and fire alike as loss
   and is retrospective (post-cut), so it can never say anything about a PROPOSED block. Removal factors for
   temperate secondary forest are IPCC Tier-1 by age class. Fine for "what was lost 2001-2024", not for BC
   proposals.
2. CBM-CFS3 / libcbm / GCBM (Canadian Forest Service). libcbm_py is open-source Python
   (https://github.com/cat-cfs/libcbm_py , docs https://cat-cfs.github.io/libcbm_py/); GCBM is open source on
   moja global FLINT (https://natural-resources.canada.ca/climate-change/climate-change-impacts-forests/generic-carbon-budget-model)
   and will replace CBM-CFS3 in NFCMARS (<0.25% difference). CBM-CFS3 itself is closed-licence (EULA forbids
   redistribution -- Kull et al. 2011 user guide).
   RIGHT: the national and BC-government standard (TSR, NIR, FCOP); all pools; disturbance matrices; HWP
   hand-off. WRONG/LIMITS for a public web tool: DOM/soil come from spin-up assumptions, needs yield curves
   (VDYP/TIPSY) and Python runtime; not a browser computation. But libcbm makes an OFFLINE, reproducible,
   precomputed per-BEC/per-age-class lookup table feasible (run once in the pipeline, ship the table, pin with
   a test). That is the most defensible architecture for OpenCanopy.
3. BC government tools: BC Carbon Calculator for Wood Products (spreadsheet on BC-HWPv1, F6); TSR carbon
   guidance (F7); FAIB carbon analysis in each TSR rationale (not reviewed per TSA this session).
4. Sierra Club BC, "Clearcut Carbon" (Wieting & Leversee, Dec 2019,
   https://sierraclub.bc.ca/stories-events/reports-and-publications/clearcut-carbon-a-report-on-the-future-of-forests-in-bc/ ):
   3.6 Mha clearcut 2005-2017; "annual emissions from logging are 42 million tonnes of CO2" (provincial data);
   ">26 million tonnes of CO2 per year remain in the atmosphere" from lost sequestration; "13 years" net-source
   period after clearcut (from provincial/CBM data). RIGHT: uses provincial inventory numbers, which are
   reproducible. WRONG-ish: the 42 Mt is IPCC instant-oxidation HWP accounting (all harvested C counted at
   harvest), and adding foregone sequestration (26 Mt) to it double-frames the counterfactual; no leakage.
5. Ancient Forest Alliance / Pojar 2019 "Forestry and Carbon in BC"
   (https://ancientforestalliance.org/wp-content/uploads/2025/04/Forestry-and-Carbon-in-BC-Jim-Pojar-Feb-2019.pdf):
   well-sourced literature review (Fredeen 41-54% loss; Matsuzaki 455->99 tC/ha; 25-40% long-term HWP storage;
   "one-time net loss of ca 100 to 300 t C/ha" for conversion). AFA public claim "logging one hectare of
   old-growth is equivalent to putting 100 new cars on the road for a year"
   (https://ancientforestalliance.org/ancient-forests/old-growth-101-the-facts-on-ancient-forests-in-bc/) has no
   shown derivation -- an equivalence OpenCanopy should NOT copy without a reproducible calculation.
6. Wilderness Committee 2021 paper (https://www.wildernesscommittee.org/sites/default/files/2021-09/2021_time_to_protect_og_paper_web.pdf):
   infographic "46% lost as waste and residue, 22% at mill, 17% transport, as little as 15% stored" -- sourced to
   Oregon Wild 2018 and US Smith et al. 2006, not BC data. Mixes carbon flows with transport offsets. Not BC-
   reproducible.
7. Focus on Victoria methodology (https://www.focusonvictoria.ca/reference-pages/methodology-for-calculating-forest-carbon-emissions-released-by-logging/):
   CO2e = harvest-billing volume x 0.82 t/m3 x 2.0 = V x 1.64. Uses HBS volumes (good: reproducible), 0.447
   t/m3 mean density, 0.5 C fraction, assumes merch stems ~50% of carbon eventually released, credits ZERO HWP
   storage and ignores timing. Transparent but one-sided; useful as an upper-bound sanity check only.
GAP NOBODY FILLS: a per-proposal (FOM) estimate, built only from government layers and government defaults
(VRI biomass + Li roots + TSR disturbance matrix + FCOP HWP factor + FCOP leakage), with the ranges from the
peer-reviewed literature shown beside it. That is OpenCanopy's opening.

### F16. National accounting context (why "logging emissions" numbers disagree by 100+ Mt)
- Canada NIR 2024 recalculated historic logged area; anthropogenic net flux on forest land 24-85 Mt CO2e/yr
  2005-2022; NIR top-line "net flux from managed forests and resulting HWP" = 24 Mt (2022). Nature Canada 2024
  (https://naturecanada.ca/wp-content/uploads/2024/09/2024-Logging-Emissions-Update-Report.pdf) recomputes
  logging-attributable net emissions as 147 Mt (2022), 189 Mt/yr avg 2005-2022, using the method of
  Polanyi et al. 2024, Frontiers in Forests and Global Change, doi:10.3389/ffgc.2023.1297301
  (https://www.frontiersin.org/journals/forests-and-global-change/articles/10.3389/ffgc.2023.1297301/full):
  forestry net source mean 90.8 Mt CO2e/yr 2005-2021 vs NIR -4.7. Mechanism: NIR excludes wildfire emissions as
  natural but counts post-fire regrowth after "commercial maturity" (45-99 yr, mean 76) as anthropogenic sink.
- Relevance to OpenCanopy: national/provincial totals are framework-dependent and contested. A per-block tool
  should NOT inherit a top-line number; it should compute the block's own stock change under BC's published
  defaults and say which accounting convention it follows. The NGO and government numbers are both
  "reproducible" from NIR tables; they differ in attribution, not arithmetic.

### F17. Ecosystem-service dollar valuations in BC: credible enough to show?
- ESSA / Morton et al. for Ancient Forest Alliance: Port Renfrew pilot 2020
  (https://ancientforestalliance.org/wp-content/uploads/2021/06/Economic-Value-of-Old-Growth-Report.pdf): +$97 M
  NPV (2018 CAD) for full protection of >140-yr stands over 100 yr; carbon ~$46 M of that (569,250 t C less
  source). Prince George + Okanagan TSA study 2025
  (https://www.essa.com/wp-content/uploads/2025/04/The-Economic-Value-of-Old-growth-Forests-in-BC_20250331.pdf ;
  methods FAQ https://www.essa.com/wp-content/uploads/2025/03/The-Economic-Value-of-Old-growth-Forests-in-BC-FAQMethods-Update_20250331.pdf):
  +$33.1 B (PG) and +$6.8 B (Okanagan) net benefit for full OG protection over 100 yr, "primarily driven by
  carbon storage benefits" valued at the federal SCC; timber losses $2.9 B / $1.2 B; recreation via benefit
  transfer from a 1989/90 BC MoF survey. Method: CBM-CFS3 + Interior Log Market Report prices + SCC.
  RIGHT: landscape scale, timber-supply-model baseline, published methods. LIMITS for per-polygon use: TSA-level
  scenario CBA with discounting and a modelled baseline; recreation values are 35 years old and population-based;
  ESSA itself flags it as a subset of TEV. Not decomposable to a single FOM block.
- Knowler & Dust (2008) for David Suzuki Foundation, Fraser TSA spotted-owl habitat
  (https://www.davidsuzuki.org/wp-content/uploads/2008/09/economics-protecting-old-growth-forests-analysis-spotted-owl-habitat-fraser-timber-supply-area-british-columbia.pdf):
  net benefit to preservation under most assumptions; flips when log prices rise and carbon is valued low.
- Olewiler 2004 Lower Fraser Valley benefit transfer: carbon $164-6,650/ha, other ES $147/ha/yr -- the 40x
  carbon range shows why per-ha transfer is not reproducible. SFMN synthesis warns: "Transfering values in per
  hectare or per land unit area can be very misleading as the units of land themselves are not generating the
  value" (https://sfmn.ualberta.ca/sfmn/wp-content/uploads/sites/83/2018/09/Natural-Capital-Using-Ecosystem-Service-Valuation-and-Market.pdf).
- VERDICT: generic per-hectare ecosystem-service dollar values are NOT SUPPORTED for a per-polygon public number
  under DECISIONS 2026-09-02 (not reproducible from shipped data; benefit transfer error unknown). Cite the ESSA
  TSA studies as context in prose only. The only monetisation with a government parameter is carbon flux x SCC.

### F18. Soil carbon response to harvest (meta-analyses; ranges)
- Nave et al. 2010, For. Ecol. Manage. 259:857-866 (432 temperate response ratios;
  https://www.changingclimate.osu.edu/assets/pubs/nave-fem-2010.pdf): overall soil C -8 +/- 3%; forest floor
  -30 +/- 6% (conifer/mixed -20%, hardwood -36%); mineral soil no significant overall change (conifer/mixed +2%
  NS); Spodosol forest floor recovery 50-70 yr.
- James & Harrison 2016, Forests 7:308 (945 responses, 112 publications; https://www.mdpi.com/1999-4907/7/12/308):
  overall -11.2% (95% CI -8.5 to -14.1%); O horizon -30.2% (conifer/mixed -38.1%); topsoil 0-15 cm -3.3%;
  60-100+ cm -17.7% (only 21 responses); Spodosol C recovers only after >=75 yr (O) and 85-100 yr (mineral);
  broadcast burning exacerbates loss.
- BC evidence: Fredeen et al. 2005 mineral soil to 1.07 m similar between OG and <20-yr stands (F5); Trofymow CFC
  soil C "did not significantly differ with stand age" (F5).
- => Defensible statement: "forest-floor carbon typically falls by about 20-38% after harvest (two global meta-
  analyses); mineral-soil change is small and uncertain." Per-polygon soil C stock is NOT in VRI; a forest-floor
  loss number therefore needs a forest-floor stock, which only CBM spin-up or a soil map provides -> model-
  dependent, show as range or omit.

### F19. Carbon fraction -- VERIFIED from IPCC 2006 GL Vol.4 Ch.4 Table 4.3 (p.4.48)
https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_04_Ch4_Forest_Land.pdf
- Default (all) 0.47. Temperate and boreal: all 0.47 (0.47-0.49); broad-leaved 0.48 (0.46-0.50); conifers 0.51
  (0.47-0.55) (Lamlom & Savidge 2003).
- National/BC conventions: CBM-CFS3 0.5 (F4); BC FCOP 0.50 "for all wood species" (F9).
- RECOMMENDATION: use 0.5 (BC FCOP / CBM, so numbers reconcile with government outputs); publish the IPCC
  conifer range 0.47-0.55 as the uncertainty band; a floor-when-in-doubt display could use 0.47. Choose once and
  pin it with a test (DECISIONS 2026-09-02).

### F20. Open soil and plant carbon maps for Canada (fills the VRI gap for soil/DOM)
- Sothe, Gonsamo, Snider, Arabian, Kurz, Finkelstein et al. 2022, "Large Soil Carbon Storage in Terrestrial
  Ecosystems of Canada", Global Biogeochemical Cycles 36(2) e2021GB007213, doi:10.1029/2021GB007213 (open access,
  https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2021GB007213). 250 m wall-to-wall: forest AGB, BGB, dead
  plant material, SOC 0-30 cm / 0-1 m / 0-2 m, with uncertainty (90% interval from quantile regression forest).
  Canada SOC top 1 m 306 +/- 147 Pg C. Training used NFI plots and BC VRI (catalogue.data.gov.bc.ca).
- Data on 4TU.ResearchData: collection doi:10.4121/c.5421810.v3 (https://data.4tu.nl/collections/_/5421810/3);
  SOC v3 doi:10.4121/16686154.v3 (https://data.4tu.nl/datasets/b8073f2c-1dc0-4a1a-98b0-19abf6cb7193);
  forest carbon stock + uncertainty doi:10.4121/14572929.v1. LICENCE NOT CHECKED -- UNVERIFIED (4TU commonly CC BY
  or CC0; confirm before shipping derived tiles).
- Fit for OpenCanopy: gives a citable, rerunnable soil-C and dead-plant-C number per polygon with its own
  uncertainty band. Caveats: 250 m pixel (6.25 ha) vs 10-15 ha FOM blocks = 2-3 pixels; machine-learning
  prediction, not measurement; snapshot (~2015-2020 inputs). Use as "soil carbon in the area (not expected to be
  mostly released)" context, NOT as an emission.

### F21. Voluntary market prices (Forest Trends' Ecosystem Marketplace, SOVCM 2025, published 2025-05-29)
https://www.ecosystemmarketplace.com/publications/2025-state-of-the-voluntary-carbon-market-sovcm/ (PDF:
https://3298623.fs1.hubspotusercontent-na1.net/hubfs/3298623/SOVCM%202025/Ecosystem%20Marketplace%20State%20of%20the%20Voluntary%20Carbon%20Market%202025.pdf)
- Forestry & Land Use average US$10.04/t (2023) -> US$9.27/t (2024), 37 Mt/yr traded.
- IFM US$16.20 (2023) -> US$14.97 (2024), volume tripled (mostly North America). REDD+ $7.87 -> $6.03.
  ARR $17.15 -> $20.44. Whole-market average $6.37/t (2024). Removal credits priced 381% above reductions.
- => The voluntary market price for the kind of credit a protected BC forest could generate (IFM/conservation)
  is ~US$15/t, consistent with BC's own $10-14/t CAD purchases. Neither is a valuation of standing stock.

### F22. "FCBM" naming -- partly resolved
- "Forest Carbon Budget Model (FCBM)" appears as a component of a UBC thesis framework (Yan 2025: SFMM + FCBM +
  Wood Product Carbon Model, Prince George TSA; https://exa.ai/library/publication/rltt94h96ck). No BC
  government document found naming an official provincial "FCBM"; BC's official forest-carbon modelling is
  CBM-CFS3 (TSR guidance F7; PIR via NIR/NFCMARS). "Forest Carbon Initiative" (FCI) appears in BC documents as a
  funding program (e.g. FCI paying for fibre hauling in the Watson slide deck, F8), not a model.
  UNVERIFIED beyond this; ask the brief's author what was meant.

---------------------------------------------------------------------------------------------------
## SYNTHESIS

### S1. Why the current framing is wrong, in three independent ways (each sourced)
1. Stock is not flux. Whole-ecosystem carbon (incl. soil, ~40% of the VRI-derived total in DellaSala et al. 2022,
   and mineral soil largely unchanged by harvest per Nave 2010 / Fredeen 2005) is not what a harvest emits.
2. Gross is not net. BC's own TSR method sends 85% of merchantable-stem carbon to products, leaves the rest on
   site to decay over decades, burns 5-10% of residue, and counts 6% of log carbon as stored at 100 yr (F7, F9);
   regrowth then re-accumulates carbon. An "avoided emission" is the DIFFERENCE between two trajectories.
3. Avoided harvest is not avoided harvest elsewhere. BC FCOP default market leakage is 47% (coast) to 72%
   (northern interior) (F9). And a credit price is the price of a verified, additional, buffered, leakage-
   discounted tonne (F11, F21), never of standing stock.

### S2. Recommended architecture (build mode: the 110% version; Lee can scope down)
Principle: every number is a government layer, a government default, or a peer-reviewed parameter, computed by
a script in the repo, pinned by a test, floored when rounded (DECISIONS 2026-09-02). Two tiers:

Tier A -- live per-polygon arithmetic (browser or edge function, no model):
  a. Area: user polygon or FOM block (FOM_CUTBLOCK_SP), minus overlapping WTRA polygons (FOM_WLDLFE_TREE_RETNTN_AREA_SP).
  b. Intersect VRI rank-1 (area-weighted, true intersection). Classify each piece: aged with biomass /
     aged but biomass 0 or null ("below inventory volume threshold") / unaged (excluded per DECISIONS) /
     disturbed since inventory (cross-check consolidated cutblocks + fire perimeters; label).
  c. Live above-ground tree carbon = (WHOLE_STEM + BRANCH + FOLIAGE + BARK biomass) x 0.5; band 0.47-0.55 (IPCC).
  d. Live below-ground = Li et al. 2003 (softwood 0.222 x AGB; hardwood 1.576 x AGB^0.615).
  e. Log carbon removed if harvested = LIVE_STAND_VOLUME_125 x FCOP species wood density x 0.5 (cross-check
     against 85% of the stem-biomass share in the TSR matrix).
  f. Stored in products at 100 yr = 6% of log carbon (FCOP/NIR, in-use only) as the displayed floor; show
     25-40% (BC explainer) / ~35% incl. landfill (Dymond 2012) as the context range.
  g. Everything else in the trees stays on site as dead organic matter: state it as "left to decay over
     decades", not "emitted at harvest".
Tier B -- precomputed, offline, pinned lookup (pipeline job, not runtime):
  h. libcbm_py (open source, CFS) runs per stratum (BEC zone x leading species x age class x site-index class)
     with VDYP/TIPSY curves and the TSR coast/interior disturbance matrices -> per-stratum tables of: DOM and
     soil stocks (spin-up), 100-yr cumulative net emission from a clearcut, and years for regrowth to re-store
     the removed carbon. Ship the table in the repo with the script that made it.
  i. Optional context layers: Sothe et al. 2022 250 m soil-C and dead-plant-C maps with their uncertainty bands
     (licence to confirm).
Never computed: stock x price; benefit-transfer $/ha; "N cars" without a Canadian factor.

### S3. The per-proposal (FOM) angle -- is it scientifically supportable?
YES for a bounded, labelled set of statements; NO for a single "this block will emit X" figure.
- Supportable today from public services (verified live, F14): block area, holder named neutrally (FSP_HOLDER_NAME),
  planned development date, inventory age and species of the stands inside it, live-tree carbon from the
  government's own biomass fields with a CF band, and the BC-default split of what happens to that carbon.
- Supportable after Tier B is built: 100-yr committed net emission range and regrowth-recovery years under BC
  TSR defaults, per stratum.
- Not supportable per block: slash treatment (not in FOM), silviculture system and retention beyond WTRA,
  actual cut volume and stumpage (appraised later from non-public cruise), whether the harvest would occur
  elsewhere anyway (only a provincial default leakage exists), and anything about final boundaries (FOM shapes
  are "approximate", may change before the cutting permit).
- CHARTER conflict to flag for Lee: Phase 6 gate says "no alert carries a figure the portal's own API does not
  give". A carbon figure in a FOM alert therefore needs either a separate linked page (alert carries only portal
  figures; the map page carries the carbon estimate) or an explicit charter amendment by Lee. Recommend the
  former: it keeps the alert gate intact.
- Honest per-block wording template (illustrative, F14 numbers): "Proposed block A18694-886-38, West Fraser
  Mills Ltd., 12.1 ha, development planned Nov 2026. BC's forest inventory records stands up to 194 years old
  here. Living trees in this area hold roughly N-M tonnes of carbon by the inventory's own biomass figures
  (inventory figures tend to undercount the oldest stands). Under BC's own carbon-accounting defaults, about
  85% of the log carbon leaves the site; 6% of that is counted as still stored in products after 100 years. The
  branches, tops, stumps and roots stay on the block and decay over the following decades." Every number in it
  traces to F2, F4, F7, F9, F14.

### S4. Adversarial notes (what a forester, a ministry modeller, or a hostile reader would attack)
- "VRI biomass is modelled from VDYP volume, not measured" -- true; it is still the government's number, and the
  error runs low for old stands (DellaSala 2022: -75% vs plots). Disclose; that is the floor the rules want.
- "You ignore substitution" -- yes, deliberately: FCOP excludes it, and substitution factors are contested
  (Kurz slides vs Harmon/Mitchell). Say so in the method note rather than silently.
- "Old forests are saturated / will burn" -- the Kurz position (F10). The block-level counter is that the
  harvest-vs-retain comparison for a specific old stand is dominated by the immediate stock transfer, and fire
  risk is landscape-probabilistic; a per-block tool should not model either fire or saturation and should say so.
- "6% is absurdly low" (industry) / "6% is generous" (NGO) -- show the range, display the government floor.
- Risk to the project: a confident single number on a named company's block is the fastest way to lose a
  "reproducible, not overstated" reputation. Ranges plus source links are the defence.

### S5. Open items / UNVERIFIED in this run
- That VDYP7 computes the VRI biomass fields with Boudewyn et al. 2007 equations (plausible, not found in a BC doc).
- BC OBPS 2026 compliance rate $110/t still in force after the 2025 CleanBC review (secondary sources only).
- Sothe et al. 2022 data licence.
- CBC Great Bear article date; Darkwoods $5.70/t (journalist's derivation).
- A Canadian (not US EPA) passenger-vehicle emissions factor for any "cars" equivalence; BC Stats population for
  a per-capita equivalence (PIR gives 61.1 Mt CO2e gross for 2023: https://www2.gov.bc.ca/gov/content/environment/climate-change/data/provincial-inventory).
- What the brief meant by "FCBM" (F22).
- Original texts of Trofymow 2007 (417 MgC/ha) and Trofymow & Blackwell 1998 (532 MgC/ha) -- cited via DellaSala 2022.

---------------------------------------------------------------------------------------------------
## What can be stated, at what confidence

| # | Candidate output | Rating | Deciding source(s) |
|---|---|---|---|
| 1 | Area of a drawn polygon / proposed block; holder; planned date | SUPPORTED | FOM_CUTBLOCK_SP fields (F14); FRPA FOM rules |
| 2 | Inventory age, leading species, BEC zone of stands inside | SUPPORTED (label "inventory, may predate recent disturbance") | VRI rank-1 (F2, F14) |
| 3 | Live above-ground tree carbon | SUPPORTED WITH RANGE (CF 0.47-0.55; VRI likely low for old stands) | VRI biomass fields (F2); IPCC T4.3 (F19); FCOP 0.5 (F9); DellaSala 2022 (F5) |
| 4 | Live below-ground (root) carbon | SUPPORTED WITH RANGE | Li et al. 2003 via CBM (F4); Matsuzaki root share (F5) |
| 5 | Dead wood + litter carbon | SUPPORTED WITH RANGE only as a model/map estimate, labelled | CBM spin-up (F4, F7); Sothe 2022 dead-plant map (F20) |
| 6 | Soil carbon stock | SUPPORTED WITH RANGE as context, never as an emission | Sothe 2022 SOC + uncertainty (F20); Nave 2010 / James & Harrison 2016 (F18) |
| 7 | Total ecosystem carbon | SUPPORTED WITH RANGE (wide; sum of 3-6) | as 3-6; field checks Trofymow, Matsuzaki, Fredeen (F5) |
| 8 | Carbon leaving the site as logs if harvested | SUPPORTED WITH RANGE | VRI volume x FCOP Table 4 density x 0.5 (F9); TSR matrix 85% (F7) |
| 9 | Carbon still stored in products after 100 yr | SUPPORTED WITH RANGE: 6% floor (gov), 25-40% / ~35% incl. landfill | FCOP HWPfact (F9); BC explainer, Dymond 2012 (F6) |
| 10 | Share of tree carbon left on site to decay | SUPPORTED (qualitative + matrix shares) | TSR disturbance matrix (F7); IPCC HWP definition (F6) |
| 11 | Slash-burn emissions for this block | NOT SUPPORTED per block (treatment unknown); SUPPORTED only as "BC default assumes 5% coast / 10% interior of residue burned" | TSR App. 3 (F7); FOM fields lack it (F14) |
| 12 | Forest-floor carbon loss after harvest | SUPPORTED WITH RANGE (20-38% of forest floor), stock model-dependent | Nave 2010; James & Harrison 2016 (F18) |
| 13 | Net CO2 released over 20/50/100 yr if harvested | SUPPORTED WITH RANGE only after a pinned offline libcbm run per stratum; NOT SUPPORTED as a hand formula | CBM-CFS3/libcbm, TSR guidance (F7, F15) |
| 14 | Recovery / "payback" time | SUPPORTED WITH RANGE (decades to centuries; old-growth conversion >200 yr; rotation usually ends recovery early); NOT SUPPORTED as one number | Harmon 1990; Trofymow 2008; Mitchell 2012; Malcolm 2020 (F10) |
| 15 | Annual sequestration foregone ("sink lost") | NOT SUPPORTED per block (VDYP old-stand curves vs old-growth-sink literature conflict; framework-dependent) | F10, F16 |
| 16 | "Avoided emissions if protected" | NOT SUPPORTED gross; SUPPORTED WITH RANGE only as (harvest - retain trajectory) x (1 - leakage 47-72%) from Tier B | FCOP leakage Table 8 (F9) |
| 17 | Stock x offset/carbon price | NOT SUPPORTED (category error) | F11, F12, F21 |
| 18 | Net flux x federal social cost of carbon | SUPPORTED WITH RANGE (SCC $170-467/t 2026 across 2.5%/1.5% discount; central $275), labelled "estimated climate damage", after leakage, from Tier B only | ECCC SC-GHG (F12) |
| 19 | Offset revenue the block "could earn" | NOT SUPPORTED (additionality, baseline, leakage, buffer, verification) | FCOP (F9); BC purchase prices $10-14/t as context (F11) |
| 20 | Stumpage the Crown would receive | SUPPORTED WITH RANGE only as district-average tabular rate x VRI volume, labelled not-the-appraisal | Coast/Interior tabular rates (F13) |
| 21 | Ecosystem-service $/ha | NOT SUPPORTED | SFMN benefit-transfer caution; ESSA scope (F17) |
| 22 | Equivalences (per-capita BC emissions) | SUPPORTED if built from PIR total and BC Stats population (both public) | BC PIR 2023 61.1 Mt (S5) |
| 23 | Equivalences ("cars off the road") | NOT SUPPORTED until a Canadian vehicle factor is sourced | AFA claim lacks derivation (F15); S5 |
| 24 | Province/sector totals ("logging emits X Mt/yr") | SUPPORTED only with the accounting convention named (NIR 24 Mt vs Polanyi/Nature Canada 147 Mt 2022) | F16 |
