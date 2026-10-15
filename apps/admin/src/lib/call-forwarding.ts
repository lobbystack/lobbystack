/** Forward only the calls the owner doesn't answer, or every call. */
export type ForwardingMode = "missed" | "all";

/** How a code expects the destination: 10 digits, 1 plus 10 digits, or +1 and 10 digits. */
export type NumberFormat = "national" | "1prefix" | "plus";

/** Fixed notes the dialog can show; their text lives in the locale files. */
export type ForwardingNote = "planFeature" | "voicemail" | "androidOnly" | "adminOnly" | "verifyNumber";

export type ForwardingMethod =
  | {
    method: "code";
    /** {number} marks where the destination goes. Without it, the line asks for the number after the code. */
    on: string;
    /** One code per condition when the carrier splits them, like ##61#, ##67# and ##62#. */
    off: string[];
    numberFormat: NumberFormat;
    /** Extra codes for carriers that split missed calls by condition. */
    busy?: string;
    unreachable?: string;
    notes?: ForwardingNote[];
  }
  | { method: "settings"; where: "phone" | "app" | "web"; path: string[]; notes?: ForwardingNote[] };

export type CarrierGroup = "usMobile" | "caMobile" | "landline" | "voip";

export type Carrier = {
  id: string;
  name: string;
  group: CarrierGroup;
  missed: ForwardingMethod | null;
  all: ForwardingMethod | null;
};

/** Fills a carrier code with a North American number in the form the carrier expects. */
export function dialCode(template: string, e164: string, format: NumberFormat): string {
  const national = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const number = format === "national" ? national : format === "1prefix" ? `1${national}` : `+1${national}`;
  return template.replace("{number}", number);
}

// Codes come from each carrier's own help pages where it publishes them, and otherwise from the network the carrier runs on.
const verizonMissed: ForwardingMethod = { method: "code", on: "*71{number}", off: ["*73"], numberFormat: "national" };
const verizonAll: ForwardingMethod = { method: "code", on: "*72{number}", off: ["*73"], numberFormat: "national" };
/** GSM codes split by condition: no answer, busy, unreachable. */
const gsmMissed = (star: "*" | "**", numberFormat: NumberFormat, off: string[], notes?: ForwardingNote[]): ForwardingMethod => ({ method: "code", on: `${star}61*{number}#`, busy: `${star}67*{number}#`, unreachable: `${star}62*{number}#`, off, numberFormat, ...(notes ? { notes } : {}) });
const gsmAll = (on: string, off: string, numberFormat: NumberFormat, notes?: ForwardingNote[]): ForwardingMethod => ({ method: "code", on, off: [off], numberFormat, ...(notes ? { notes } : {}) });
/** One GSM code for every missed-call condition. */
const gsmAnyMissed = (off: string, notes?: ForwardingNote[]): ForwardingMethod => ({ method: "code", on: "*004*{number}#", off: [off], numberFormat: "national", ...(notes ? { notes } : {}) });
const phoneMissed = (notes: ForwardingNote[]): ForwardingMethod => ({ method: "settings", where: "phone", path: ["Phone app", "Settings", "Call forwarding", "Forward when unanswered"], notes });
const phoneAll = (notes?: ForwardingNote[]): ForwardingMethod => ({ method: "settings", where: "phone", path: ["Phone settings", "Call forwarding", "Always forward"], ...(notes ? { notes } : {}) });
const landlineMissed: ForwardingMethod = { method: "code", on: "*92{number}", busy: "*90{number}", off: ["*93", "*91"], numberFormat: "national", notes: ["planFeature"] };
const landlineAll: ForwardingMethod = { method: "code", on: "*72{number}", off: ["*73"], numberFormat: "national", notes: ["planFeature"] };
const tmobileMissed = gsmMissed("**", "1prefix", ["##004#"]);
const tmobileAll = gsmAll("**21*{number}#", "##21#", "1prefix");
const attMissed = gsmMissed("**", "national", ["##61#", "##67#", "##62#"]);
const attAll = gsmAll("**21*{number}#", "##21#", "national");

const carriers: Carrier[] = [
  { id: "verizon", name: "Verizon", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "att", name: "AT&T", group: "usMobile", missed: attMissed, all: attAll },
  { id: "tmobile", name: "T-Mobile", group: "usMobile", missed: tmobileMissed, all: tmobileAll },
  { id: "metro", name: "Metro by T-Mobile", group: "usMobile", missed: tmobileMissed, all: tmobileAll },
  { id: "uscellular", name: "UScellular (now T-Mobile)", group: "usMobile", missed: tmobileMissed, all: tmobileAll },
  { id: "mint", name: "Mint Mobile", group: "usMobile", missed: gsmMissed("**", "1prefix", ["##61#", "##67#", "##62#"]), all: tmobileAll },
  { id: "cricket", name: "Cricket Wireless", group: "usMobile", missed: attMissed, all: attAll },
  { id: "consumer-cellular", name: "Consumer Cellular", group: "usMobile", missed: attMissed, all: attAll },
  { id: "boost", name: "Boost Mobile", group: "usMobile", missed: null, all: phoneAll() },
  { id: "visible", name: "Visible", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "xfinity", name: "Xfinity Mobile", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "spectrum", name: "Spectrum Mobile", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "straight-talk", name: "Straight Talk", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "total-wireless", name: "Total Wireless", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "tracfone", name: "Tracfone", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "us-mobile-warp", name: "US Mobile (Warp)", group: "usMobile", missed: verizonMissed, all: verizonAll },
  { id: "us-mobile-light-speed", name: "US Mobile (Light Speed)", group: "usMobile", missed: gsmMissed("**", "national", ["##61#", "##67#", "##62#"]), all: gsmAll("**21*{number}#", "##21#", "national") },
  { id: "us-mobile-dark-star", name: "US Mobile (Dark Star)", group: "usMobile", missed: gsmMissed("*", "national", ["##61#", "##67#", "##62#"]), all: gsmAll("*21*{number}#", "#21#", "national") },
  { id: "google-fi", name: "Google Fi", group: "usMobile", missed: null, all: { method: "settings", where: "app", path: ["Google Fi app", "Phone settings", "Call forwarding", "Always forward"], notes: ["verifyNumber"] } },

  { id: "bell", name: "Bell", group: "caMobile", missed: phoneMissed(["androidOnly", "planFeature"]), all: phoneAll(["planFeature"]) },
  { id: "rogers", name: "Rogers", group: "caMobile", missed: gsmMissed("*", "national", ["##61#", "##67#", "##62#"], ["voicemail", "planFeature"]), all: gsmAll("*21*{number}#", "##21#", "national", ["planFeature"]) },
  { id: "telus", name: "Telus", group: "caMobile", missed: gsmAnyMissed("#004#", ["planFeature"]), all: gsmAll("*21*{number}#", "#21#", "national", ["planFeature"]) },
  { id: "fido", name: "Fido", group: "caMobile", missed: gsmMissed("*", "national", ["##61#", "##67#", "##62#"], ["voicemail", "planFeature"]), all: gsmAll("*21*{number}#", "##21#", "national", ["planFeature"]) },
  { id: "koodo", name: "Koodo", group: "caMobile", missed: gsmMissed("*", "national", ["#61#", "#67#", "#62#"], ["planFeature"]), all: gsmAll("*21*{number}#", "#21#", "national", ["planFeature"]) },
  { id: "virgin-plus", name: "Virgin Plus", group: "caMobile", missed: phoneMissed(["androidOnly", "planFeature"]), all: phoneAll(["planFeature"]) },
  { id: "freedom", name: "Freedom Mobile", group: "caMobile", missed: gsmMissed("*", "national", ["#61#", "#67#", "#62#"]), all: gsmAll("*21*{number}#", "#21#", "national") },
  { id: "videotron", name: "Vidéotron", group: "caMobile", missed: phoneMissed(["androidOnly", "planFeature"]), all: phoneAll(["planFeature"]) },
  { id: "public-mobile", name: "Public Mobile", group: "caMobile", missed: gsmAnyMissed("#004#"), all: gsmAll("*21*{number}#", "#21#", "national") },
  { id: "chatr", name: "Chatr", group: "caMobile", missed: gsmMissed("*", "national", ["##61#", "##67#", "##62#"], ["voicemail"]), all: gsmAll("*21*{number}#", "##21#", "national") },
  { id: "sasktel", name: "SaskTel", group: "caMobile", missed: gsmAnyMissed("#004#", ["planFeature"]), all: gsmAll("*21*{number}#", "#21#", "national", ["planFeature"]) },
  { id: "eastlink", name: "Eastlink", group: "caMobile", missed: gsmAnyMissed("##004#", ["planFeature"]), all: gsmAll("*21*{number}#", "##21#", "national", ["planFeature"]) },
  // Lucky Mobile says its call forwarding features are unavailable.
  { id: "lucky", name: "Lucky Mobile", group: "caMobile", missed: null, all: null },

  { id: "landline-us", name: "US landline (AT&T, Verizon, Spectrum, Xfinity)", group: "landline", missed: landlineMissed, all: landlineAll },
  { id: "landline-ca", name: "Canadian landline (Rogers, SaskTel, Eastlink)", group: "landline", missed: { ...landlineMissed, notes: ["voicemail", "planFeature"] }, all: landlineAll },
  // Bell's home phone uses *90 and *92 for its own voicemail, so only forwarding every call works.
  { id: "bell-home", name: "Bell Home Phone", group: "landline", missed: null, all: landlineAll },
  // TELUS sets the destination for missed calls itself when you order the feature.
  { id: "telus-home", name: "Telus Home Phone", group: "landline", missed: null, all: landlineAll },

  { id: "ringcentral", name: "RingCentral", group: "voip", missed: { method: "settings", where: "app", path: ["Settings", "Phone", "Call handling", "Work hours", "Missed calls", "Forward to external number"] }, all: { method: "settings", where: "app", path: ["Profile picture", "Incoming call rules", "Forward all calls"] } },
  { id: "google-voice", name: "Google Voice", group: "voip", missed: { method: "settings", where: "web", path: ["Admin console", "Apps", "Google Workspace", "Google Voice", "Ring groups", "Unanswered calls", "Forward the caller"], notes: ["adminOnly"] }, all: { method: "settings", where: "web", path: ["voice.google.com", "Settings", "Calls", "Call forwarding"], notes: ["verifyNumber"] } },
  { id: "vonage", name: "Vonage Business", group: "voip", missed: { method: "settings", where: "web", path: ["app.vonage.com", "Settings", "Call Forwarding", "Follow Me"] }, all: { method: "settings", where: "web", path: ["app.vonage.com", "Settings", "Call Forwarding", "Forward All Calls"] } },
  { id: "dialpad", name: "Dialpad", group: "voip", missed: { method: "settings", where: "web", path: ["Admin Settings", "Office", "Main Line", "Call Routing", "Operators", "Fallback Options"], notes: ["adminOnly"] }, all: { method: "settings", where: "web", path: ["Admin Settings", "Office", "Main Line", "Call Routing", "No operator"], notes: ["adminOnly"] } },
  { id: "quo", name: "Quo (OpenPhone)", group: "voip", missed: { method: "settings", where: "web", path: ["Settings", "Phone numbers", "Edit call flow", "Forward call (after Ring users)"] }, all: { method: "settings", where: "web", path: ["Settings", "Phone numbers", "Edit call flow", "Forward all calls"] } },
  { id: "ooma", name: "Ooma Office", group: "voip", missed: { method: "settings", where: "web", path: ["Settings", "Call Handling", "Ring devices in a specific order"] }, all: { method: "code", on: "*72", off: ["*74"], numberFormat: "national" } },
  { id: "grasshopper", name: "Grasshopper", group: "voip", missed: { method: "settings", where: "web", path: ["Extensions", "Edit", "Add a forwarding number", "In order, just once"] }, all: { method: "settings", where: "web", path: ["Extensions", "Edit", "Add a forwarding number"] } },
  { id: "nextiva", name: "Nextiva", group: "voip", missed: { method: "settings", where: "app", path: ["Call settings", "Forwarding", "When Unanswered"] }, all: { method: "code", on: "*72", off: ["*73"], numberFormat: "national" } },
  { id: "8x8", name: "8x8", group: "voip", missed: { method: "settings", where: "app", path: ["Settings", "Account settings", "Call forwarding rules", "When you do not answer"] }, all: { method: "settings", where: "app", path: ["Settings", "Account settings", "Call forwarding rules", "Always"] } },
  { id: "zoom-phone", name: "Zoom Phone", group: "voip", missed: { method: "settings", where: "app", path: ["Settings", "Phone", "Voicemail and forwarding", "When a call goes unanswered", "Forward to External Contacts"] }, all: null },
  { id: "teams", name: "Microsoft Teams Phone", group: "voip", missed: { method: "settings", where: "app", path: ["Settings", "Calls", "Call handling and forwarding", "If unanswered"] }, all: { method: "settings", where: "app", path: ["Settings", "Calls", "Call handling and forwarding", "Forward my calls"] } },
  { id: "goto-connect", name: "GoTo Connect", group: "voip", missed: { method: "settings", where: "app", path: ["Settings", "Voice", "Find me follow me", "No answer, send to", "External"] }, all: { method: "settings", where: "app", path: ["Settings", "Voice", "Find me follow me", "Ring Step"] } },
  { id: "verizon-one-talk", name: "Verizon One Talk", group: "voip", missed: { method: "code", on: "**92{number}#", busy: "**90{number}#", off: ["**920", "**900"], numberFormat: "national" }, all: { method: "code", on: "**72{number}#", off: ["**73"], numberFormat: "national" } },
  { id: "spectrum-business", name: "Spectrum Business Voice", group: "voip", missed: { method: "code", on: "*92", busy: "*90", off: ["*93", "*91"], numberFormat: "1prefix" }, all: { method: "code", on: "*72{number}#", off: ["*73"], numberFormat: "1prefix" } },
  { id: "comcast-business", name: "Comcast Business Voice", group: "voip", missed: { method: "code", on: "*92", busy: "*90", off: ["*93", "*91"], numberFormat: "national" }, all: { method: "code", on: "*72", off: ["*73"], numberFormat: "national" } },
];


const groupOrder: CarrierGroup[] = ["usMobile", "caMobile", "landline", "voip"];

export const carrierGroups = groupOrder.map((id) => ({ id, items: carriers.filter((carrier) => carrier.group === id) }));
