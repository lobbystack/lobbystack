export default {
  title: "Template ng kaalaman",
  intro: [
    "Sagutan ang naaangkop sa iyong negosyo at iwanang blangko ang iba. I-upload ang file na ito sa Kaalaman, sa ilalim ng Magdagdag ng kaalaman. Binabasa ng iyong receptionist ang iyong mga sagot at hindi pinapansin ang mga kulay-abong tala na tulad nito.",
    "Sumulat ng buong pangungusap na binabanggit ang paksa: “Ang 60-minutong masahe ay nagkakahalaga ng ₱900,” hindi lang “₱900.” Isama ang mga yunit sa mga numero at petsa sa anumang may bisa lang hanggang tiyak na araw. Iwasan ang mga talahanayan, larawan, at “tingnan ang aming website.” I-type ang nilalaman dito.",
  ],
  sections: {
    about: {
      title: "Tungkol sa negosyo",
      hint: "Sabihin kung sino ka sa simpleng salita. Maririnig ito ng mga tumatawag kapag nagtanong sila kung ano ang ginagawa mo.",
      prompts: [
        "Pangalan ng negosyo",
        "Ano ang ginagawa ng iyong negosyo, at para kanino ito?",
        "Anong mga lungsod o lugar ang pinaglilingkuran mo?",
        "Gaano ka na katagal sa negosyo, at ano ang sinasabi ng mga customer na nagpapaiba sa iyo?",
        "Anong mga wika ang sinasalita ng iyong team?",
        "Paano ka maaabot ng mga customer bukod sa pagtawag (email, website, social media)?",
      ],
    },
    location: {
      title: "Lokasyon at daan",
      hint: "Nasa iyong dashboard ang oras ng bukas at mga araw na sarado. Idagdag dito ang mga detalyeng itinatanong ng mga tumatawag bukod doon.",
      prompts: [
        "Ano ang kumpleto mong address, at anong mga palatandaan o sangandaan ang makakatulong para mahanap ka?",
        "Saan puwedeng magparada ang mga customer, at magkano ito?",
        "Madaling mapuntahan ba ang lokasyon (pasukan na walang hagdan, elevator, banyong madaling magamit)?",
        "May higit sa isang lokasyon ka ba? Ibigay ang address ng bawat isa.",
        "Pumupunta ka ba sa mga customer? Ibigay ang mga lugar at anumang bayad sa pagbiyahe.",
      ],
    },
    services: {
      title: "Mga serbisyo nang detalyado",
      hint: "Nasa iyong dashboard ang listahan ng mga serbisyo. Ilarawan dito ang bawat serbisyo. Simulan ang bawat sagot sa pangalan ng serbisyo para maintindihan ito kahit mag-isa. Kopyahin ang block para sa bawat dagdag na serbisyo.",
      prompts: [
        "Pangalan ng serbisyo",
        "Ano ang kasama",
        "Gaano katagal",
        "Presyo, o saklaw ng presyo",
        "Para kanino ito, at para kanino hindi",
        "Ano ang ihahanda o dadalhin",
        "Ano ang susunod na mangyayari",
      ],
    },
    pricing: {
      title: "Presyo at bayad",
      prompts: [
        "Anong mga paraan ng pagbabayad ang tinatanggap mo?",
        "Naniningil ka ba ng deposito o bayad sa reserbasyon? Sabihin ang halaga at kung kailan ito dapat bayaran.",
        "Nagbibigay ka ba ng quote o libreng estimate? Paano ito makukuha ng customer?",
        "Anong mga insurance, membership, o opsyon sa financing ang tinatanggap mo?",
        "Anong mga diskwento, package, o promo ang kasalukuyang meron? Isama ang petsa ng pagtatapos.",
      ],
    },
    booking: {
      title: "Pag-book at iskedyul",
      prompts: [
        "Paano nagbu-book ang mga bagong customer, at ano ang dapat nilang nakahanda?",
        "Gaano kaaga dapat mag-book ang mga customer, at gaano kabilis karaniwang may bakanteng oras?",
        "Tumatanggap ka ba ng walk-in o kahilingan sa parehong araw?",
        "Ano ang patakaran mo sa pagkansela at paglipat ng oras? Sabihin ang kailangang abiso at anumang bayad.",
        "Ano ang nangyayari kapag na-late o hindi sumipot ang customer?",
        "Puwede bang magdala ang mga customer ng bata, kasama, o alagang hayop?",
        "Tumatanggap ka ba ng group, paulit-ulit, o after-hours na booking?",
      ],
    },
    policies: {
      title: "Mga patakaran",
      prompts: [
        "Ano ang patakaran mo sa refund, pagbabalik, o garantiya?",
        "Anong mga kinakailangang ID, edad, o kwalipikasyon ang umiiral?",
        "Anong mga tuntunin sa kalusugan, kaligtasan, o asal ang dapat alam ng mga customer?",
      ],
    },
    team: {
      title: "Team",
      hint: "Nasa iyong dashboard ang mga miyembro ng team. Idagdag ang hinahanap ng mga tumatawag ayon sa pangalan o pangangailangan.",
      prompts: [
        "Sino ang dapat hanapin ng mga tumatawag sa mga partikular na sitwasyon? Halimbawa: para sa bridal booking, hanapin si Maria.",
        "Aling mga miyembro ng team ang may espesyalidad o sertipikasyong itinatanong ng mga customer?",
      ],
    },
    urgent: {
      title: "Mga agarang sitwasyon at labas ng oras",
      prompts: [
        "Ano ang itinuturing na agaran o emergency, at ano ang dapat unang gawin ng tumatawag?",
        "Ano ang dapat sabihin ng receptionist sa mga tumatawag pagkatapos ng oras ng trabaho?",
      ],
    },
    limits: {
      title: "Mga hangganan at paglilipat sa tao",
      hint: "Sabihin sa receptionist kung hanggang saan lang siya. Banggitin ang paksa at ang dahilan.",
      prompts: [
        "Aling mga kahilingan ang dapat mapunta sa isang tao? Halimbawa: reklamo, alitan sa billing, tanong na legal o medikal.",
        "Ano ang hindi dapat ipangako o sabihin ng receptionist? Halimbawa: eksaktong presyo sa telepono, garantisadong resulta.",
        "Ano ang kailangan mong malaman sa tumatawag bago ka makatulong (pangalan, address, sasakyan, numero ng order)?",
        "Paano dapat harapin ng receptionist ang mga tawag sa pagbebenta at mula sa mga supplier?",
      ],
    },
    terms: {
      title: "Mga pangalan, termino, at bigkas",
      prompts: [
        "Aling mga pangalan ng negosyo, team, o produkto ang mahirap bigkasin? Isulat kung paano sabihin ang bawat isa.",
        "Anong mga terminong pang-industriya o daglat ang ginagamit ng mga customer, at ano ang kahulugan ng mga ito?",
        "Anong ibang negosyo o brand ang napagkakamalan ng mga customer na sa iyo?",
      ],
    },
    news: {
      title: "Mga bagong balita",
      hint: "Alisin ang bawat item kapag luma na.",
      prompts: [
        "Ano ang nagbago kamakailan o malapit nang magbago (bagong serbisyo, konstruksyon, pagbabago sa panahon, oras ng paghihintay)? Isama ang mga petsa.",
      ],
    },
    faq: {
      title: "Madalas itanong",
      hint: "Isulat ang 10 tanong na pinakamadalas itanong ng mga tumatawag, saka sagutin ang bawat isa ng buong pangungusap. Burahin ang mga pares na hindi mo gagamitin.",
    },
  },
};
