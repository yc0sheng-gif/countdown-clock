大型時鐘倒數計時器 PWA 第二版
================================

內容
- 大型圓形時鐘：彩色圓環隨剩餘時間逐漸縮小。
- 快速切換：倒數畫面可直接點選其他預設時間並立即開始。
- 預設時間：短時間 1 分鐘、煮菜 5 分鐘、休息 10 分鐘、運動 30 分鐘。
- 自訂倒數：可設定名稱、時、分、秒與顏色；自訂項目會留在快速切換列。
- 滴答聲：可開關及調整音量；剩餘 30% 開始逐漸加速，剩餘 10% 達到 2 倍速度。
- 結束提示音：清脆、柔和、雙響；可調音量；可試聽；可播放一次、延長（約 8 秒）或重複 5 次。
- 暫停/繼續、重來、結束、全螢幕。
- 支援 PWA 安裝及離線快取（需 HTTPS，例如 GitHub Pages）。
- 設定儲存在目前瀏覽器/裝置本機，不會自動跨裝置同步。

GitHub Pages 部署
1. 將 ZIP 解壓縮。
2. 將 index.html、style.css、app.js、manifest.webmanifest、sw.js、icon.svg
   及 README.txt 全部上傳到 GitHub 儲存庫根目錄（不要只上傳外層資料夾）。
3. 在 GitHub 儲存庫進入 Settings > Pages。
4. Build and deployment 選 Deploy from a branch。
5. Branch 選 main，資料夾選 /(root)，按 Save。
6. 等待 GitHub Pages 部署完成，使用頁面顯示的 https://...github.io/... 網址開啟。

使用
- 點選任一快速時間按鈕，會立即切換並開始倒數。
- 「開始」開始計時；「暫停」可暫停；「重來」回到該時間起點；「結束」停止並回到起始時間。
- 點齒輪設定聲音。聲音通常需要先由使用者點擊開始按鈕，瀏覽器才允許播放。
- Android Chrome 可由選單選「安裝應用程式」或「加入主畫面」。
- Windows Chrome/Edge 可使用網址列的安裝圖示或瀏覽器選單安裝。

注意
- iOS/Android/桌面瀏覽器對全螢幕、螢幕常亮與 PWA 安裝的支援程度不同。
- Screen Wake Lock 只在支援的瀏覽器與 HTTPS 環境中生效。
- 聲音由 Web Audio API 即時產生，不需另外放置 WAV/MP3。
