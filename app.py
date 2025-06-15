import os
import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
from sqlalchemy import or_, desc, asc
from models import db, Broadcast

# --- Konfigurasi Aplikasi (Tetap Sama) ---
app = Flask(__name__)
# app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(app.instance_path, 'database.db')
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:@localhost/suara_radio_mahasiswa'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'kunci-rahasia-yang-sangat-aman'

db.init_app(app)
socketio = SocketIO(app)

rekaman_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rekaman')

if not os.path.exists(rekaman_folder):
    os.makedirs(rekaman_folder)
if not os.path.exists(app.instance_path):
    os.makedirs(app.instance_path)

with app.app_context():
    db.create_all()

# --- Variabel Global untuk Siaran ---
active_broadcast_id = None
start_time_obj = None # Untuk menyimpan waktu mulai sebagai objek datetime
file_writer = None

# --- Rute Halaman (Routing) ---
@app.route('/')
def index():
    return render_template('penyiar.html')

@app.route('/penyiar')
def penyiar_page():
    return render_template('penyiar.html')

@app.route('/client')
def client_page():
    # Mengirim data arsip dan siaran live ke template
    arsip = Broadcast.query.filter_by(is_live=False).order_by(Broadcast.id.desc()).all()
    live_broadcast = Broadcast.query.filter_by(is_live=True).first()
    return render_template('client.html', arsip=arsip, live_broadcast=live_broadcast)

@app.route('/rekaman/<filename>')
def serve_recording(filename):
    return send_from_directory(rekaman_folder, filename)

@app.route('/search')
def search_broadcasts():
    # Fungsi pencarian dan sorting (tidak berubah, tapi sekarang mengirim durasi)
    query = request.args.get('q', '')
    sort_by = request.args.get('sort', 'date_desc')
    search_query = Broadcast.query.filter(
        or_(Broadcast.title.like(f"%{query}%"), Broadcast.broadcast_date.like(f"%{query}%"))
    )
    if sort_by == 'title_asc':
        search_query = search_query.order_by(asc(Broadcast.title))
    elif sort_by == 'title_desc':
        search_query = search_query.order_by(desc(Broadcast.title))
    elif sort_by == 'date_asc':
        search_query = search_query.order_by(asc(Broadcast.broadcast_date), asc(Broadcast.start_time))
    else:
        search_query = search_query.order_by(desc(Broadcast.broadcast_date), desc(Broadcast.start_time))
    
    results = search_query.filter_by(is_live=False).all()

    # --- PERUBAHAN DI SINI ---
    # Sekarang kita juga mengirim 'duration' ke client
    broadcast_list = [{
        'id': b.id,
        'title': b.title,
        'date': b.broadcast_date,
        'start_time': b.start_time,
        'filename': b.filename,
        'duration': b.duration_in_seconds 
    } for b in results]
    
    return jsonify(broadcast_list)

# --- Logika WebSocket (SocketIO) ---
@socketio.on('start_broadcast')
def handle_start_broadcast(data):
    """Mencatat waktu mulai saat siaran dimulai."""
    global active_broadcast_id, start_time_obj, file_writer
    
    start_time_obj = datetime.datetime.now() # Catat waktu mulai yang presisi
    
    timestamp = start_time_obj.strftime("%Y%m%d_%H%M%S")
    filename = f"siaran_{timestamp}.webm"
    
    new_broadcast = Broadcast(
        title=data['title'],
        broadcast_date=data['date'],
        start_time=data['startTime'],
        filename=filename,
        is_live=True
    )
    db.session.add(new_broadcast)
    db.session.commit()
    
    active_broadcast_id = new_broadcast.id
    current_broadcast_file = os.path.join(rekaman_folder, filename)
    
    try:
        file_writer = open(current_broadcast_file, 'wb')
        emit('broadcast_started', {'title': new_broadcast.title}, broadcast=True)
        print(f"Siaran '{data['title']}' dimulai, merekam ke {filename}")
    except Exception as e:
        print(f"Gagal memulai rekaman: {e}")

@socketio.on('audio_chunk')
def handle_audio_chunk(chunk):
    """Menerima dan menyimpan audio (tidak berubah)."""
    emit('live_audio', chunk, broadcast=True)
    if file_writer:
        try:
            file_writer.write(chunk)
        except Exception as e:
            print(f"Gagal menulis chunk: {e}")

@socketio.on('stop_broadcast')
def handle_stop_broadcast(data):
    """Menghitung durasi, menyimpan ke DB, dan menghentikan siaran."""
    global active_broadcast_id, start_time_obj, file_writer
    
    if file_writer:
        file_writer.close()
        file_writer = None

    if active_broadcast_id and start_time_obj:
        broadcast_to_stop = Broadcast.query.get(active_broadcast_id)
        if broadcast_to_stop:
            end_time_obj = datetime.datetime.now()
            # Hitung selisih waktu untuk mendapatkan durasi
            duration = end_time_obj - start_time_obj
            broadcast_to_stop.duration_in_seconds = int(duration.total_seconds())
            
            broadcast_to_stop.is_live = False
            broadcast_to_stop.end_time = data['endTime']
            db.session.commit()
    
    emit('broadcast_stopped', {}, broadcast=True)
    print(f"Siaran dihentikan. Durasi: {duration.total_seconds()} detik.")
    active_broadcast_id = None
    start_time_obj = None

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
