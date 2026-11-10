export default {
  title: "Mẫu kiến thức",
  intro: [
    "Hãy điền những gì áp dụng cho doanh nghiệp của bạn và bỏ trống phần còn lại. Tải tệp này lên trong Kiến thức, ở mục Thêm kiến thức. Lễ tân của bạn đọc các câu trả lời và bỏ qua những ghi chú màu xám như dòng này.",
    "Viết câu đầy đủ có nêu rõ chủ đề: “Một buổi massage 60 phút có giá 900.000 đ”, không chỉ ghi “900.000 đ”. Ghi số kèm đơn vị và ghi ngày cho mọi thứ có hạn. Tránh bảng, hình ảnh và “xem trên website của chúng tôi”. Hãy nhập nội dung tại đây.",
  ],
  sections: {
    about: {
      title: "Về doanh nghiệp",
      hint: "Hãy nói bạn là ai bằng lời giản dị. Người gọi sẽ nghe điều này khi họ hỏi bạn làm gì.",
      prompts: [
        "Tên doanh nghiệp",
        "Doanh nghiệp của bạn làm gì và dành cho ai?",
        "Bạn phục vụ những thành phố hoặc khu vực nào?",
        "Bạn hoạt động được bao lâu và theo khách hàng, điều gì khiến bạn khác biệt?",
        "Đội ngũ của bạn nói những ngôn ngữ nào?",
        "Ngoài gọi điện, khách hàng có thể liên hệ bạn bằng cách nào (email, website, mạng xã hội)?",
      ],
    },
    location: {
      title: "Địa điểm và lối vào",
      hint: "Giờ mở cửa và ngày nghỉ nằm trong bảng điều khiển của bạn. Hãy thêm vào đây những chi tiết mà người gọi hỏi thêm.",
      prompts: [
        "Địa chỉ đầy đủ của bạn là gì và những địa danh hay ngã tư nào giúp mọi người tìm ra bạn?",
        "Khách có thể đỗ xe ở đâu và giá bao nhiêu?",
        "Địa điểm có thuận tiện cho người khuyết tật không (lối vào không bậc thang, thang máy, nhà vệ sinh phù hợp)?",
        "Bạn có nhiều hơn một địa điểm không? Hãy ghi địa chỉ của từng nơi.",
        "Bạn có đến tận nơi khách hàng không? Hãy nêu các khu vực và phí di chuyển nếu có.",
      ],
    },
    pricing: {
      title: "Giá và thanh toán",
      prompts: [
        "Bạn chấp nhận những hình thức thanh toán nào?",
        "Bạn có thu tiền đặt cọc hoặc phí đặt chỗ không? Nêu số tiền và thời hạn.",
        "Bạn có báo giá hoặc ước tính miễn phí không? Khách hàng nhận bằng cách nào?",
        "Bạn chấp nhận những loại bảo hiểm, thẻ thành viên hoặc hình thức trả góp nào?",
        "Hiện có những ưu đãi, gói hoặc khuyến mãi nào? Nêu ngày kết thúc.",
      ],
    },
    booking: {
      title: "Đặt chỗ và lịch hẹn",
      prompts: [
        "Khách hàng mới đặt lịch như thế nào và cần chuẩn bị sẵn những gì?",
        "Khách nên đặt trước bao lâu và thường bao lâu thì có chỗ trống tiếp theo?",
        "Bạn có nhận khách không hẹn trước hoặc yêu cầu trong ngày không?",
        "Chính sách hủy và đổi lịch của bạn là gì? Nêu thời gian báo trước cần thiết và phí nếu có.",
        "Điều gì xảy ra khi khách đến muộn hoặc không đến?",
        "Khách có thể đưa trẻ em, người đi cùng hoặc thú cưng theo không?",
        "Bạn có nhận đặt lịch theo nhóm, định kỳ hoặc ngoài giờ không?",
      ],
    },
    policies: {
      title: "Chính sách",
      prompts: [
        "Chính sách hoàn tiền, đổi trả hoặc bảo hành của bạn là gì?",
        "Yêu cầu nào về giấy tờ tùy thân, độ tuổi hoặc điều kiện được áp dụng?",
        "Khách hàng cần biết những quy tắc nào về sức khỏe, an toàn hoặc ứng xử?",
      ],
    },
    team: {
      title: "Đội ngũ",
      hint: "Các thành viên trong đội ngũ nằm trong bảng điều khiển của bạn. Hãy thêm điều người gọi hỏi theo tên hoặc theo nhu cầu.",
      prompts: [
        "Người gọi nên hỏi ai trong những tình huống cụ thể? Ví dụ: với lịch hẹn cô dâu, hãy hỏi chị Maria.",
        "Những thành viên nào có chuyên môn hoặc chứng chỉ mà khách hàng hay hỏi?",
      ],
    },
    urgent: {
      title: "Tình huống khẩn cấp và ngoài giờ",
      prompts: [
        "Điều gì được coi là khẩn cấp hoặc cấp cứu, và người gọi nên làm gì trước tiên?",
        "Lễ tân nên nói gì với người gọi ngoài giờ làm việc?",
      ],
    },
    limits: {
      title: "Giới hạn và chuyển cho người",
      hint: "Hãy nói cho lễ tân biết khi nào cần dừng lại. Nêu chủ đề và lý do.",
      prompts: [
        "Những yêu cầu nào phải chuyển cho một người? Ví dụ: khiếu nại, tranh chấp thanh toán, câu hỏi pháp lý hoặc y tế.",
        "Lễ tân tuyệt đối không được hứa hay báo điều gì? Ví dụ: giá chính xác qua điện thoại, kết quả được đảm bảo.",
        "Bạn cần biết gì từ người gọi trước khi có thể giúp (tên, địa chỉ, phương tiện, mã đơn hàng)?",
        "Lễ tân nên xử lý các cuộc gọi chào hàng và của nhà cung cấp như thế nào?",
      ],
    },
    terms: {
      title: "Tên, thuật ngữ và cách phát âm",
      prompts: [
        "Tên doanh nghiệp, thành viên hoặc sản phẩm nào khó phát âm? Hãy viết cách đọc từng tên.",
        "Khách hàng dùng những thuật ngữ hoặc từ viết tắt nào của ngành và chúng có nghĩa là gì?",
        "Khách hàng hay nhầm doanh nghiệp của bạn với doanh nghiệp hoặc thương hiệu nào khác?",
      ],
    },
    news: {
      title: "Tin mới",
      hint: "Hãy xóa từng mục khi nó đã lỗi thời.",
      prompts: [
        "Gần đây có gì thay đổi hoặc sắp thay đổi (dịch vụ mới, thi công, thay đổi theo mùa, thời gian chờ)? Nêu ngày.",
      ],
    },
    faq: {
      title: "Câu hỏi thường gặp",
      hint: "Viết 10 câu hỏi mà người gọi hỏi nhiều nhất, rồi trả lời từng câu bằng câu đầy đủ. Xóa những cặp bạn không dùng.",
    },
  },
};
