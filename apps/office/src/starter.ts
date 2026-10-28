// Starter HVAC prices from the mockup. The owner can load them once, then edit.
export const STARTER_ITEMS = [
 {
  "category": "Diagnostic",
  "name": "Diagnostic",
  "unit": null,
  "prices": {
   "res": 89,
   "com": 125,
   "ah": 175
  }
 },
 {
  "category": "Electrical",
  "name": "Replace capacitor",
  "unit": null,
  "prices": {
   "res": 189,
   "com": 245,
   "ah": 279
  }
 },
 {
  "category": "Electrical",
  "name": "Replace contactor",
  "unit": null,
  "prices": {
   "res": 239,
   "com": 329,
   "ah": 369
  }
 },
 {
  "category": "Electrical",
  "name": "Install hard start kit",
  "unit": null,
  "prices": {
   "res": 265,
   "com": 325,
   "ah": 365
  }
 },
 {
  "category": "Motors",
  "name": "Replace condenser fan motor",
  "unit": null,
  "prices": {
   "res": 525,
   "com": 612,
   "ah": 690
  }
 },
 {
  "category": "Motors",
  "name": "Replace blower motor",
  "unit": null,
  "prices": {
   "res": 745,
   "com": 880,
   "ah": 960
  }
 },
 {
  "category": "Refrigerant",
  "name": "Refrigerant R-410A",
  "unit": "lb",
  "prices": {
   "res": 95,
   "com": 95,
   "ah": 115
  }
 },
 {
  "category": "Refrigerant",
  "name": "Leak search and repair",
  "unit": null,
  "prices": {
   "res": 395,
   "com": 495,
   "ah": 575
  }
 },
 {
  "category": "Maintenance",
  "name": "PM visit",
  "unit": null,
  "prices": {
   "res": 129,
   "com": 165
  }
 },
 {
  "category": "Maintenance",
  "name": "Clear drain line",
  "unit": null,
  "prices": {
   "res": 149,
   "com": 189,
   "ah": 229
  }
 },
 {
  "category": "Maintenance",
  "name": "Coil cleaning",
  "unit": null,
  "prices": {
   "res": 225,
   "com": 295
  }
 },
 {
  "category": "Electrical",
  "name": "Replace thermostat",
  "unit": null,
  "prices": {
   "res": 289,
   "com": 349,
   "ah": 399
  }
 }
] as { category: string; name: string; unit: string | null; prices: Record<string, number> }[];
export const STARTER_MATS: [string, string, number][] = [["1/2\" foam pipe insulation", "ft", 1.25], ["3/4\" PVC fittings", "ea", 2.5], ["3/4\" PVC pipe", "ft", 1.1], ["Condensate pan tablets", "ea", 1.5], ["Copper line set 3/8 x 3/4", "ft", 9.75], ["Disconnect, 60A non-fused", "ea", 38], ["Filter 16x25x1", "ea", 9], ["Filter 20x20x1", "ea", 9], ["Foil tape", "roll", 14], ["Liquid line filter drier", "ea", 28], ["R-410A refrigerant", "lb", 95], ["Thermostat wire 18/8", "ft", 0.85], ["Wire nuts", "ea", 0.35]];
