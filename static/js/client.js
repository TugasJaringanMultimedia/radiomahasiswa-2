document.addEventListener("DOMContentLoaded", () => {
  // --- Elemen DOM ---
  const socket = io();
  const livePlayer = document.getElementById("livePlayer");
  const liveStatus = document.getElementById("live-status");
  const liveTitle = document.getElementById("live-title");
  const searchBox = document.getElementById("searchBox");
  const sortOptions = document.getElementById("sortOptions");
  const archiveList = document.getElementById("archive-list");

  // --- Variabel untuk Live Player ---
  let mediaSource;
  let sourceBuffer;
  let audioQueue = [];

  // --- FUNGSI UNTUK LIVE PLAYER ---
  function setupLivePlayer() {
    // Hanya setup jika belum ada atau source sudah ditutup
    if (!mediaSource || mediaSource.readyState === "closed") {
      try {
        mediaSource = new MediaSource();
        livePlayer.src = URL.createObjectURL(mediaSource);
        mediaSource.addEventListener("sourceopen", onSourceOpen);
        console.log("MediaSource setup untuk live player.");
      } catch (e) {
        console.error("MediaSource API tidak didukung.", e);
        liveStatus.innerHTML = "Browser tidak mendukung streaming langsung.";
      }
    }
  }

  function onSourceOpen() {
    // Cek jika sourceBuffer sudah ada, hapus dulu untuk menghindari error
    if (sourceBuffer && mediaSource.sourceBuffers.length > 0) {
      mediaSource.removeSourceBuffer(sourceBuffer);
    }
    sourceBuffer = mediaSource.addSourceBuffer("audio/webm; codecs=opus");
    sourceBuffer.addEventListener("updateend", () => {
      if (audioQueue.length > 0 && !sourceBuffer.updating) {
        try {
          sourceBuffer.appendBuffer(audioQueue.shift());
        } catch (error) {
          console.error("Gagal menambahkan buffer ke antrian:", error);
        }
      }
    });
    // Proses antrian jika ada
    if (audioQueue.length > 0) {
      sourceBuffer.appendBuffer(audioQueue.shift());
    }
  }

  // --- FUNGSI UNTUK TAMPILAN ARSIP (dari server-side) ---
  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) {
      return "";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formatted = `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
    return `| Durasi: ${formatted}`;
  };

  const fetchAndRenderArchives = async () => {
    const query = searchBox.value;
    const sort = sortOptions.value;
    const response = await fetch(
      `/search?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`
    );
    const results = await response.json();
    archiveList.innerHTML = "";
    if (results.length > 0) {
      results.forEach((b) => {
        archiveList.innerHTML += `
                  <div class="archive-item">
                    <div class="archive-info">
                      <span class="title">${b.title}</span>
                      <span class="meta">
                        ${b.date} | ${b.start_time}
                        ${formatDuration(b.duration)}
                      </span>
                    </div>
                    <audio controls preload="none" src="/rekaman/${
                      b.filename
                    }"></audio>
                  </div>
                `;
      });
    } else {
      archiveList.innerHTML =
        '<p id="no-archives">Tidak ada rekaman ditemukan.</p>';
    }
  };

  // --- KONEKSI SOCKET.IO (INTI PERBAIKAN) ---

  // Menerima audio chunk untuk siaran langsung
  socket.on("live_audio", (chunk) => {
    if (!sourceBuffer) return;
    const arrayBuffer = new Uint8Array(chunk).buffer;
    if (mediaSource.readyState === "open" && !sourceBuffer.updating) {
      try {
        sourceBuffer.appendBuffer(arrayBuffer);
      } catch (e) {
        // Jika error, kemungkinan karena buffer penuh atau state berubah, masukkan ke antrian
        audioQueue.push(arrayBuffer);
        console.error("Error appending buffer, queuing...:", e);
      }
    } else {
      audioQueue.push(arrayBuffer);
    }
  });

  // **[PERBAIKAN]** Event handler saat siaran dimulai
  socket.on("broadcast_started", (data) => {
    console.log("Sinyal 'broadcast_started' diterima:", data.title);
    // Hapus alert dan reload, ganti dengan manipulasi DOM
    // alert(`Siaran baru dimulai: ${data.title}\nRefresh halaman untuk mendengarkan!`);
    // window.location.reload();

    // 1. Ubah teks status dan judul
    liveStatus.innerHTML = 'Sedang berlangsung: <span id="live-title"></span>';
    document.getElementById("live-title").textContent = data.title;

    // 2. Tampilkan elemen audio player
    livePlayer.style.display = "block"; // atau '' untuk kembali ke default

    // 3. Setup MediaSource untuk player yang baru ditampilkan
    setupLivePlayer();
  });

  // **[PERBAIKAN]** Event handler saat siaran berhenti
  socket.on("broadcast_stopped", () => {
    console.log("Sinyal 'broadcast_stopped' diterima.");
    // Ganti alert dan reload dengan manipulasi DOM

    // 1. Ubah kembali teks status
    liveStatus.textContent = "Tidak ada siaran langsung saat ini.";

    // 2. Sembunyikan dan reset player
    livePlayer.style.display = "none";
    livePlayer.src = ""; // Hentikan pemutaran dan bebaskan resource

    // Beri jeda sedikit sebelum memuat ulang daftar arsip untuk memastikan server sudah selesai menyimpan
    setTimeout(fetchAndRenderArchives, 1000);
  });

  // --- Event Listeners dan Panggilan Awal ---
  searchBox.addEventListener("input", fetchAndRenderArchives);
  sortOptions.addEventListener("change", fetchAndRenderArchives);

  // Setup live player jika halaman sudah dalam kondisi 'live' saat dimuat
  if (livePlayer && livePlayer.style.display !== "none") {
    setupLivePlayer();
  }
});
