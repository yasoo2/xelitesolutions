
import socket
import sys

def check_port(host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2)
    try:
        s.connect((host, port))
        print(f"✅ Port {port} is OPEN on {host}")
        return True
    except Exception as e:
        print(f"❌ Port {port} is CLOSED on {host}. Error: {e}")
        return False
    finally:
        s.close()

if __name__ == "__main__":
    if check_port("127.0.0.1", 7070):
        sys.exit(0)
    else:
        sys.exit(1)
