export default {
  title: "Bilgi şablonu",
  intro: [
    "İşletmenizle ilgili olanları doldurun, gerisini boş bırakın. Bu dosyayı Bilgi bölümünde, Bilgi ekle altından yükleyin. Resepsiyonistiniz yanıtlarınızı okur, bunun gibi gri notları yok sayar.",
    "Konuyu adıyla anan tam cümleler yazın: “60 dakikalık masaj 900 TL tutarındadır”, “900 TL” değil. Sayıları birimleriyle, süresi dolan her şey için tarihle yazın. Tablo, görsel ve “web sitemize bakın” ifadelerinden kaçının. İçeriği buraya yazın.",
  ],
  sections: {
    about: {
      title: "İşletme hakkında",
      hint: "Kim olduğunuzu sade sözlerle söyleyin. Arayanlar ne yaptığınızı sorduğunda bunu duyar.",
      prompts: [
        "İşletme adı",
        "İşletmeniz ne yapıyor ve kimlere hitap ediyor?",
        "Hangi şehirlere veya bölgelere hizmet veriyorsunuz?",
        "Ne zamandır faaliyettesiniz ve müşterilere göre sizi ne farklı kılıyor?",
        "Ekibiniz hangi dilleri konuşuyor?",
        "Müşteriler size aramanın dışında nasıl ulaşabilir (e-posta, web sitesi, sosyal medya)?",
      ],
    },
    location: {
      title: "Konum ve ulaşım",
      hint: "Çalışma saatleri ve kapalı günler panonuzda. Arayanların bunlara ek olarak sorduğu ayrıntıları buraya ekleyin.",
      prompts: [
        "Tam adresiniz nedir ve hangi yer işaretleri veya kavşaklar sizi bulmaya yardımcı olur?",
        "Müşteriler nereye park edebilir ve ücreti nedir?",
        "Konum erişilebilir mi (basamaksız giriş, asansör, erişilebilir tuvalet)?",
        "Birden fazla şubeniz var mı? Her birinin adresini yazın.",
        "Müşterilerin ayağına gidiyor musunuz? Bölgeleri ve varsa yol ücretini yazın.",
      ],
    },
    pricing: {
      title: "Fiyatlar ve ödeme",
      prompts: [
        "Hangi ödeme yöntemlerini kabul ediyorsunuz?",
        "Kapora veya rezervasyon ücreti alıyor musunuz? Tutarı ve ne zaman ödeneceğini yazın.",
        "Teklif veya ücretsiz keşif veriyor musunuz? Müşteri nasıl alır?",
        "Hangi sigortaları, üyelikleri veya finansman seçeneklerini kabul ediyorsunuz?",
        "Hangi indirim, paket veya kampanyalar sürüyor? Bitiş tarihlerini yazın.",
      ],
    },
    booking: {
      title: "Rezervasyon ve randevu",
      prompts: [
        "Yeni müşteriler nasıl randevu alır ve yanlarında neleri hazır bulundurmalı?",
        "Müşteriler ne kadar önceden randevu almalı ve bir sonraki boş yer genellikle ne zaman?",
        "Randevusuz müşteri veya aynı gün talebi kabul ediyor musunuz?",
        "İptal ve erteleme politikanız nedir? Gereken bildirim süresini ve varsa ücreti yazın.",
        "Müşteri geç kalırsa veya gelmezse ne olur?",
        "Müşteriler çocuk, misafir veya evcil hayvan getirebilir mi?",
        "Grup, düzenli veya mesai dışı randevuları kabul ediyor musunuz?",
      ],
    },
    policies: {
      title: "Politikalar",
      prompts: [
        "İade, geri verme veya garanti politikanız nedir?",
        "Hangi kimlik, yaş veya uygunluk şartları geçerli?",
        "Müşterilerin bilmesi gereken hangi sağlık, güvenlik veya davranış kuralları var?",
      ],
    },
    team: {
      title: "Ekip",
      hint: "Ekip üyeleriniz panonuzda. Arayanların isimle veya ihtiyaçla sorduklarını ekleyin.",
      prompts: [
        "Arayanlar belirli durumlarda kimi sormalı? Örnek: gelin randevuları için Maria'yı sorun.",
        "Hangi ekip üyelerinin müşterilerin sorduğu uzmanlıkları veya sertifikaları var?",
      ],
    },
    urgent: {
      title: "Acil durumlar ve mesai dışı",
      prompts: [
        "Neyi acil veya acil durum sayıyorsunuz ve arayanlar önce ne yapmalı?",
        "Resepsiyonist mesai dışında arayanlara ne söylemeli?",
      ],
    },
    limits: {
      title: "Sınırlar ve aktarma",
      hint: "Resepsiyoniste nerede duracağını söyleyin. Konuyu ve nedenini yazın.",
      prompts: [
        "Hangi talepler bir kişiye aktarılmalı? Örnek: şikâyetler, fatura anlaşmazlıkları, hukuki veya tıbbi sorular.",
        "Resepsiyonist hiçbir zaman neyi vaat etmemeli veya söylememeli? Örnek: telefonda kesin fiyat, garantili sonuç.",
        "Yardım edebilmeniz için arayandan neyi bilmeniz gerekir (ad, adres, araç, sipariş numarası)?",
        "Resepsiyonist satış ve tedarikçi aramalarına nasıl davranmalı?",
      ],
    },
    terms: {
      title: "Adlar, terimler ve telaffuz",
      prompts: [
        "Hangi işletme, ekip veya ürün adlarını söylemek zor? Her birinin nasıl söylendiğini yazın.",
        "Müşteriler hangi sektör terimlerini veya kısaltmalarını kullanıyor ve ne anlama geliyor?",
        "Müşteriler sizinkini hangi diğer işletme veya markalarla karıştırıyor?",
      ],
    },
    news: {
      title: "Güncel haberler",
      hint: "Her madde eskidiğinde kaldırın.",
      prompts: [
        "Yakın zamanda ne değişti veya değişecek (yeni hizmetler, inşaat, mevsimsel değişiklikler, bekleme süreleri)? Tarihleri yazın.",
      ],
    },
    faq: {
      title: "Sık sorulan sorular",
      hint: "Arayanların en çok sorduğu 10 soruyu yazın, her birini tam cümlelerle yanıtlayın. Kullanmadığınız çiftleri silin.",
    },
  },
};
