document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const livePlayer = document.getElementById("livePlayer");
  const liveStatus = document.getElementById("live-status");
  const liveTitle = document.getElementById("live-title");
  const searchBox = document.getElementById("searchBox");
  const sortOptions = document.getElementById("sortOptions");
  const archiveList = document.getElementById("archive-list");

  let mediaSource;
  let sourceBuffer;
  let audioQueue = [];

  function setupLivePlayer() {
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
      try {
        mediaSource.removeSourceBuffer(sourceBuffer);
      } catch (e) {
        console.warn("Gagal menghapus SourceBuffer lama:", e);
      }
    }
    try {
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
    } catch (e) {
      console.error("Gagal menambahkan SourceBuffer:", e);
      liveStatus.innerHTML = "Error streaming langsung: codecs tidak didukung.";
    }
  }

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

  // Menerima audio chunk untuk siaran langsung
  socket.on("live_audio", (chunk) => {
    if (!sourceBuffer) {
      console.warn("SourceBuffer belum siap untuk live_audio.");
      audioQueue.push(new Uint8Array(chunk).buffer); // Tetap antrekan
      return;
    }
    const arrayBuffer = new Uint8Array(chunk).buffer;
    if (mediaSource.readyState === "open" && !sourceBuffer.updating) {
      try {
        sourceBuffer.appendBuffer(arrayBuffer);
        // Coba putar jika belum
        if (livePlayer.paused) {
          livePlayer
            .play()
            .catch((e) => console.log("Live player auto-play prevented:", e));
        }
      } catch (e) {
        audioQueue.push(arrayBuffer);
        console.error("Error appending buffer, queuing...:", e);
      }
    } else {
      audioQueue.push(arrayBuffer);
    }
  });

  socket.on("broadcast_started", (data) => {
    console.log("Sinyal 'broadcast_started' diterima:", data.title);
    liveStatus.innerHTML = 'Sedang berlangsung: <span id="live-title"></span>';
    document.getElementById("live-title").textContent = data.title;
    livePlayer.style.display = "block";
    setupLivePlayer(); // Panggil setupLivePlayer setiap kali siaran baru dimulai
  });

  socket.on("broadcast_stopped", () => {
    console.log("Sinyal 'broadcast_stopped' diterima.");
    liveStatus.textContent = "Tidak ada siaran langsung saat ini.";
    livePlayer.style.display = "none";
    livePlayer.src = ""; // Menghentikan pemutaran dan membebaskan resource
    if (mediaSource && mediaSource.readyState === "open") {
      try {
        mediaSource.endOfStream();
      } catch (e) {
        console.warn("Gagal mengakhiri stream MediaSource:", e);
      }
    }
    mediaSource = null; // Reset MediaSource agar bisa dibuat baru saat siaran berikutnya
    sourceBuffer = null;
    audioQueue = []; // Kosongkan antrean

    setTimeout(fetchAndRenderArchives, 1000);
  });

  searchBox.addEventListener("input", fetchAndRenderArchives);
  sortOptions.addEventListener("change", fetchAndRenderArchives);

  fetchAndRenderArchives();

  // Inisiasi live player jika ada siaran langsung saat halaman dimuat
  // Ini adalah perbaikan penting agar client bisa memutar siaran yang sudah berjalan
  if (
    livePlayer.style.display !== "none" &&
    liveStatus.textContent.includes("Sedang berlangsung")
  ) {
    console.log(
      "Siaran live ditemukan saat memuat halaman. Menyiapkan live player."
    );
    setupLivePlayer();
  }
});
