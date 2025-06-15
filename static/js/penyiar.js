document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const statusDiv = document.getElementById("status");
  const form = document.getElementById("broadcastForm");
  const formInputs = form.querySelectorAll("input");
  const btnForceStopServer = document.getElementById("btnForceStopServer"); // Dapatkan tombol baru

  let mediaRecorder;
  // isBroadcasting akan diinisialisasi berdasarkan disabled state tombol
  let isBroadcasting = btnStop.disabled === false;

  // Set tanggal dan waktu hari ini secara default jika tidak ada siaran langsung
  if (!document.getElementById("date").value) {
    const now = new Date();
    document.getElementById("date").value = now.toISOString().split("T")[0];
    document.getElementById("startTime").value = now
      .toTimeString()
      .split(" ")[0]
      .substring(0, 5);
  }

  // Atur disabled state form inputs saat startup berdasarkan isBroadcasting
  if (isBroadcasting) {
    formInputs.forEach((input) => (input.disabled = true));
    statusDiv.style.color = "red";
  } else {
    statusDiv.style.color = "grey";
  }

  btnStart.addEventListener("click", startBroadcasting);
  btnStop.addEventListener("click", stopBroadcasting);

  // Event listener untuk tombol Hentikan Siaran di Server
  if (btnForceStopServer) {
    btnForceStopServer.addEventListener("click", () => {
      if (
        confirm(
          "Anda yakin ingin menghentikan siaran ini di server? Ini akan menghentikan aliran audio ke pendengar dan menandai siaran sebagai selesai, tetapi tidak akan menghentikan rekaman di sisi browser Anda jika masih berjalan."
        )
      ) {
        socket.emit("force_stop_broadcast");
        // Setelah force stop, kita reset UI penyiar agar bisa memulai siaran baru
        isBroadcasting = false;
        btnStart.disabled = false;
        btnStop.disabled = true;
        formInputs.forEach((input) => (input.disabled = false));
        statusDiv.textContent = "Status: Tidak Siaran";
        statusDiv.style.color = "grey";
        // Hapus tombol force stop
        btnForceStopServer.style.display = "none";
        if (mediaRecorder) {
          // Hentikan juga rekaman lokal jika masih aktif
          mediaRecorder.stop();
          mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        }
      }
    });
  }

  async function startBroadcasting() {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      const formData = new FormData(form);
      const broadcastData = {
        title: formData.get("title"),
        date: formData.get("date"),
        startTime: formData.get("startTime"),
      };

      // Kirim detail siaran ke server untuk memulai
      socket.emit("start_broadcast", broadcastData);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          socket.emit("audio_chunk", event.data);
        }
      };

      mediaRecorder.start(1000); // Kirim data setiap detik

      // Update UI
      isBroadcasting = true;
      btnStart.disabled = true;
      btnStop.disabled = false;
      formInputs.forEach((input) => (input.disabled = true));
      statusDiv.textContent = `Status: Sedang Siaran - ${broadcastData.title}`;
      statusDiv.style.color = "red";
      if (btnForceStopServer) {
        // Sembunyikan tombol force stop jika siaran baru dimulai
        btnForceStopServer.style.display = "none";
      }
    } catch (error) {
      console.error("Error starting broadcast:", error);
      statusDiv.textContent =
        "Error: Gagal mengakses mikrofon atau memulai siaran.";
    }
  }

  function stopBroadcasting() {
    if (mediaRecorder && isBroadcasting) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      const endTime = new Date().toTimeString().split(" ")[0].substring(0, 5);
      socket.emit("stop_broadcast", { endTime: endTime });

      isBroadcasting = false;
      btnStart.disabled = false;
      btnStop.disabled = true;
      formInputs.forEach((input) => (input.disabled = false));
      statusDiv.textContent = "Status: Tidak Siaran";
      statusDiv.style.color = "grey";
      if (btnForceStopServer) {
        // Sembunyikan tombol force stop jika siaran dihentikan normal
        btnForceStopServer.style.display = "none";
      }
    } else {
      console.warn(
        "MediaRecorder tidak aktif atau isBroadcasting false, tidak bisa menghentikan siaran."
      );
      // Jika sampai sini, kemungkinan ini adalah kasus setelah refresh
      // Di sini Anda mungkin ingin mengirim event 'force_stop_broadcast' secara otomatis
      // atau memberikan pesan ke user untuk menggunakan tombol "Hentikan Siaran di Server"
      if (
        confirm(
          "Siaran mungkin masih aktif di server. Apakah Anda ingin menghentikannya secara paksa dari server?"
        )
      ) {
        socket.emit("force_stop_broadcast");
      }
    }
  }

  // Socket event untuk memastikan UI penyiar diperbarui jika siaran berhenti dari tempat lain (misal, force_stop dari penyiar lain atau server restart)
  socket.on("broadcast_stopped", () => {
    console.log("Sinyal 'broadcast_stopped' diterima di penyiar.");
    // Reset UI ke kondisi tidak siaran
    isBroadcasting = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    formInputs.forEach((input) => (input.disabled = false));
    statusDiv.textContent = "Status: Tidak Siaran";
    statusDiv.style.color = "grey";
    if (btnForceStopServer) {
      btnForceStopServer.style.display = "none";
    }
  });

  // Jika halaman dimuat dan ada siaran yang sedang berlangsung (dari DB),
  // tombol "Hentikan Siaran" akan aktif, tapi `mediaRecorder` mungkin tidak ada.
  // Pastikan penyiar tahu mereka tidak mengontrol `mediaRecorder` langsung lagi.
  if (isBroadcasting && !mediaRecorder) {
    statusDiv.innerHTML = `<span style="color: red;">Sedang Siaran - ${
      document.getElementById("title").value || "judul tidak diketahui"
    }</span><br><small>(Siaran ini dimulai sebelum halaman di-refresh. Kontrol rekaman audio di browser hilang. Gunakan "Hentikan Siaran di Server" untuk menghentikan aliran ke pendengar.)</small>`;
    // Sembunyikan tombol "Hentikan Siaran" biasa karena tidak akan berfungsi
    btnStop.style.display = "none";
    // Pastikan tombol "Hentikan Siaran di Server" terlihat
    if (btnForceStopServer) {
      btnForceStopServer.style.display = "inline-block";
    }
  }
});
