document.addEventListener("DOMContentLoaded", () => {
  // --- Elemen yang sudah ada ---
  const socket = io();
  const livePlayer = document.getElementById("livePlayer");
  const liveStatus = document.getElementById("live-status");
  const liveTitle = document.getElementById("live-title");
  const searchBox = document.getElementById("searchBox");
  const archiveList = document.getElementById("archive-list");

  // --- Elemen baru untuk sorting ---
  const sortOptions = document.getElementById("sortOptions");

  // --- Variabel dan fungsi untuk Live Player (Tidak berubah) ---
  let mediaSource;
  let sourceBuffer;
  let audioQueue = [];

  function setupLivePlayer() {
    try {
      mediaSource = new MediaSource();
      livePlayer.src = URL.createObjectURL(mediaSource);
      mediaSource.addEventListener("sourceopen", onSourceOpen);
    } catch (e) {
      console.error("MediaSource API tidak didukung.", e);
      liveStatus.textContent += " (Browser tidak mendukung streaming langsung)";
    }
  }

  function onSourceOpen() {
    // Gunakan format audio yang sesuai dengan yang dikirim dari server
    // 'audio/webm; codecs=opus' adalah umum untuk streaming dari browser
    sourceBuffer = mediaSource.addSourceBuffer("audio/webm; codecs=opus");
    sourceBuffer.addEventListener("updateend", () => {
      if (audioQueue.length > 0 && !sourceBuffer.updating) {
        sourceBuffer.appendBuffer(audioQueue.shift());
      }
    });
  }

  if (livePlayer && livePlayer.style.display !== "none") {
    setupLivePlayer();
  }

  socket.on("live_audio", (chunk) => {
    if (!sourceBuffer) return;
    const arrayBuffer = new Uint8Array(chunk).buffer;
    if (!sourceBuffer.updating && mediaSource.readyState === "open") {
      try {
        sourceBuffer.appendBuffer(arrayBuffer);
      } catch (e) {
        console.error("Error appending buffer:", e);
      }
    } else {
      audioQueue.push(arrayBuffer);
    }
  });

  // --- Notifikasi siaran (Tidak berubah) ---
  socket.on("broadcast_started", (data) => {
    alert(
      `Siaran baru dimulai: ${data.title}\nRefresh halaman untuk mendengarkan!`
    );
    window.location.reload();
  });

  socket.on("broadcast_stopped", () => {
    alert(
      "Siaran langsung telah berakhir. Halaman akan dimuat ulang untuk memperbarui arsip."
    );
    window.location.reload();
  });

  // --- FUNGSI BARU: Mengambil data arsip berdasarkan pencarian dan sorting ---
  const fetchAndRenderArchives = async () => {
    const query = searchBox.value;
    const sort = sortOptions.value; // Ambil nilai dari dropdown sort

    // Kirim request ke backend dengan parameter 'q' dan 'sort'
    const response = await fetch(
      `/search?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`
    );
    const results = await response.json();

    archiveList.innerHTML = ""; // Kosongkan daftar saat ini

    if (results.length > 0) {
      results.forEach((b) => {
        // Buat elemen HTML untuk setiap hasil dan tambahkan ke daftar
        archiveList.innerHTML += `
          <div class="archive-item">
            <div class="archive-info">
              <span class="title">${b.title}</span>
              <span class="meta">${b.date} | ${b.start_time}</span>
            </div>
            <audio controls preload="none" src="/rekaman/${b.filename}"></audio>
          </div>
        `;
      });
    } else {
      archiveList.innerHTML =
        '<p id="no-archives">Tidak ada rekaman ditemukan.</p>';
    }
  };

  // --- Event Listener yang diperbarui ---
  // Panggil fungsi di atas saat pengguna mengetik di kotak pencarian
  searchBox.addEventListener("input", fetchAndRenderArchives);

  // Panggil fungsi yang sama saat pengguna mengubah pilihan sorting
  sortOptions.addEventListener("change", fetchAndRenderArchives);
});
