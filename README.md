<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="Biểu tượng QuickMedia Downloader">
</p>

<h1 align="center">QuickMedia Downloader - Tải Nhanh Ảnh &amp; Video trên mọi hình ảnh/video của trang web</h1>

<p align="center">
  Extension mã nguồn mở (Manifest V3) dành cho Chrome, Edge và Brave — tự động gắn nút Liquid Glass siêu nhỏ ngay trên mọi hình ảnh và video khi rê chuột để tải về chỉ với 1 click.
</p>

<p align="center">
  <a href="https://quickmediadownloader.hwo.workers.dev/">Trang giới thiệu</a> ·
  <a href="https://github.com/hwo63/quickmediadownloader/releases/latest">Tải bản Release dùng ngay</a> ·
  <a href="#tính-năng-nổi-bật">Tính năng</a> ·
  <a href="#cài-đặt-nhanh-từ-bản-release-không-cần-build">Cài nhanh không cần build</a> ·
  <a href="#cách-build-và-nạp-vào-chrome--edge--brave">Build từ mã nguồn</a> ·
  <a href="LICENSE">Giấy phép MIT</a>
</p>

---

## Giới thiệu

**QuickMedia Downloader - Tải Nhanh Ảnh & Video trên mọi hình ảnh/video của trang web** là tiện ích mở rộng trình duyệt (Chromium Manifest V3) hoạt động hoàn toàn cục bộ trên máy người dùng, không thu thập dữ liệu, không máy chủ trung gian.

Khi bạn rê chuột vào bất kỳ hình ảnh hoặc thẻ `<video>` nào đủ điều kiện trên trang web, một nút kính mờ (Liquid Glass) tối giản sẽ xuất hiện ngay tại góc phương tiện để bạn tải bản gốc chất lượng cao nhất chỉ với một lần bấm.

## Tính năng nổi bật

- **Hiển thị thông minh khi Hover & Chỉ lấy link lúc rê chuột:**
  - Giao diện trang web luôn gọn gàng, chỉ hiện nút khi con trỏ đi vào vùng ảnh hoặc video.
  - Thực hiện trích xuất liên kết tải theo cơ chế lười (lazy-fetch on hover) để không gây nặng trang và tải ngay lập tức khi bấm.
- **Thiết kế Liquid Glass tối giản (chỉ chữ, không icon rườm rà):**
  - **Hình ảnh (xanh dương):** hiển thị kích thước thực tế (ví dụ `1920×1080`, `2560×1440`) và tự ưu tiên tìm URL gốc chất lượng cao (`srcset`, `data-original`, `name=orig` trên X...).
  - **Video (xanh lá):** hiển thị chất lượng ngắn gọn (`4K`, `1080p`, `720p`, `Video`) kèm menu chọn chất lượng hoặc tải ảnh bìa (poster).
  - Tự động thích ứng theo **Dark Mode / Light Mode** của hệ điều hành và dựng hoàn toàn trong **Shadow DOM** để không bị CSS trang web làm vỡ bố cục.
- **Nhận diện chính xác trình phát Video trên mọi website:**
  - Bắt được cả các video player có lớp phủ điều khiển (overlay / click shield) như Video.js, Plyr, JWPlayer, mạng xã hội, trang tin tức và thẻ `<video>` HTML5 thuần.
  - Tự loại bỏ các ảnh/video bị che khuất bởi popup, lightbox, thanh cuộn `overflow: hidden` hoặc poster trùng với video.
- **Hỗ trợ chuyên sâu cho X (Twitter):**
  - Chặn bắt dữ liệu GraphQL API (`fetch` / `XMLHttpRequest`) kết hợp đọc React Fiber trong ngữ cảnh `MAIN` world để lấy link MP4 gốc độ nét cao từ `video.twimg.com` và ảnh gốc `name=orig`.
- **Tiện ích đi kèm:**
  - Menu chuột phải (Context Menu): tải nhanh hình ảnh, video hoặc liên kết bất kỳ.
  - Popup cài đặt: bật/tắt riêng cho ảnh hoặc video, chọn 4 góc hiển thị, lọc kích thước ảnh tối thiểu (`80px`, `120px`, `180px`, `250px`), tùy chọn hộp thoại lưu file (`Save As`) và thống kê lượt tải.

---

## Cài đặt nhanh từ bản Release (không cần build)

Nếu bạn muốn sử dụng ngay mà không cần chạy script build:

1. Mở trang [Releases](https://github.com/hwo63/quickmediadownloader/releases/latest) (hoặc thư mục [`releases/`](releases/)) và tải file `.zip` mới nhất.
2. Giải nén file `.zip` thành một thư mục trên máy của bạn.
3. Mở trang quản lý tiện ích của trình duyệt:
   - **Google Chrome:** `chrome://extensions`
   - **Microsoft Edge:** `edge://extensions`
   - **Brave Browser:** `brave://extensions`
4. Bật **Developer mode** (Chế độ dành cho nhà phát triển).
5. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục vừa giải nén ở bước 2.

---

## Cách build và nạp vào Chrome / Edge / Brave

### Yêu cầu môi trường

- macOS hoặc Linux có sẵn `zsh`, `python3` và `zip` (tùy chọn `node` để kiểm tra cú pháp JS).

### Các bước build từ mã nguồn

1. Clone repository về máy:
   ```bash
   git clone https://github.com/hwo63/quickmediadownloader.git
   cd quickmediadownloader
   ```
2. Chạy script build & đóng gói:
   ```bash
   chmod +x scripts/build-release.sh
   ./scripts/build-release.sh
   ```
3. Kết quả sau khi build:
   - Thư mục extension sạch sẵn sàng nạp trực tiếp: `dist/QuickMediaDownloader/`
   - File nén phát hành sẵn sàng chia sẻ: `releases/QuickMediaDownloader-*.zip`

### Nạp bản vừa build vào trình duyệt

- **Google Chrome:**
  1. Truy cập `chrome://extensions`.
  2. Bật công tắc **Developer mode** ở góc trên bên phải.
  3. Chọn **Load unpacked** ➔ trỏ vào thư mục `dist/QuickMediaDownloader` (hoặc thư mục gốc dự án nếu muốn sửa code trực tiếp rồi bấm Reload).
- **Microsoft Edge:**
  1. Truy cập `edge://extensions`.
  2. Bật **Developer mode** ở cột bên trái (hoặc góc trên).
  3. Chọn **Load unpacked** ➔ chọn thư mục `dist/QuickMediaDownloader`.
- **Brave Browser:**
  1. Truy cập `brave://extensions`.
  2. Bật **Developer mode** ở góc trên bên phải.
  3. Chọn **Load unpacked** ➔ chọn thư mục `dist/QuickMediaDownloader`.

*(Khi cập nhật mã nguồn mới, bạn chỉ cần chạy lại `./scripts/build-release.sh` và bấm biểu tượng **Reload 🔄** trên thẻ extension trong trình duyệt.)*

---

## Cấu trúc dự án

```text
.
├── manifest.json             # Cấu hình Manifest V3 và khai báo extension
├── background/
│   └── service-worker.js     # Xử lý chrome.downloads, đặt tên file, context menu & thống kê
├── content/
│   ├── content.js            # Quét ảnh/video, Shadow DOM Liquid Glass badge & hover lazy-fetch
│   ├── content.css           # Quy tắc CSS bổ trợ cho content script
│   └── x-interceptor.js      # MAIN-world interceptor trích xuất MP4 gốc trên X/Twitter
├── popup/
│   ├── popup.html            # Giao diện cài đặt & thống kê lượt tải
│   ├── popup.css             # Giao diện dark UI cho popup
│   └── popup.js              # Lưu cấu hình vào chrome.storage & đồng bộ các tab
├── icons/                    # Bộ icon 16/32/48/128 px
├── scripts/
│   └── build-release.sh      # Script kiểm tra cú pháp & đóng gói bản release ZIP
├── releases/                 # Chứa file .zip release dựng sẵn để dùng ngay
├── website/                  # Trang web giới thiệu tĩnh (sẵn sàng deploy lên Cloudflare Pages)
├── test-preview.html         # Trang HTML mẫu dùng kiểm tra hiển thị ảnh/video cục bộ
├── LICENSE                   # Giấy phép mã nguồn mở MIT
└── README.md
```

## Giấy phép

Dự án được phát hành dưới giấy phép **MIT** — xem chi tiết tại tệp [LICENSE](LICENSE).
