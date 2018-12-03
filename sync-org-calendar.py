#!/usr/bin/env python3
import argparse
import json
import os.path
import threading
import time
import warnings
from configparser import ConfigParser
from datetime import datetime, timedelta
from glob import glob
from http.server import BaseHTTPRequestHandler, HTTPServer
from icalendar import Calendar, Event
from os.path import expanduser

from sync_org_calendar.ics_merger import merge_ics_files
from sync_org_calendar import ORG_CALENDARS, TIMEZONE
from sync_org_calendar import get_events, import_to_org, collect_times_from_org_files

warnings.simplefilter(action='ignore', category=FutureWarning)

org_directory = None
calendars_to_serve = {}

def get_org_files():
    return glob(expanduser(expanduser(os.path.join(org_directory, "**/*.org"))), recursive=True) + \
        glob(expanduser(expanduser(os.path.join(org_directory, "**/*.org_archive"))), recursive=True)

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/calendar/"):
            for name, calendar in calendars_to_serve.items():
                if self.path == "/calendar/" + name + "/":
                    self.send_calendar(calendar)
                    return

        elif self.path.startswith("/org/"):
            for w in ORG_CALENDARS:
                if self.path == "/org/" + w + "/":
                    files = get_org_files()
                    data = create_calendar(files, w)
                    self.send_file(data, "text/calendar")
                    return

        elif self.path.startswith("/timeline"):
            if self.path in ("/timeline", "/timeline/"):
                self.path = os.path.join(self.path, "index.html")

            if self.path == "/timeline/timeline.json":
                files = get_org_files()
                timeline_data = generate_timeline_data(files)
                self.send_file(json.dumps(timeline_data), "application/json")
                return

            filepath = self.path[1:]
            if os.path.exists(filepath):
                self.send_file(open(filepath).read())
                return

        self.send_404()

    def send_calendar(self, calendar):
        files = glob(expanduser(calendar["directory"]) + "/**/*.ics")
        data = merge_ics_files(calendar["name"], calendar["description"], files)
        self.send_file(data, "text/calendar")

    def send_404(self):
        self.send_response(404)
        self.end_headers()

    def send_file(self, data, mimetype=None):
        self.send_response(200)
        if mimetype:
            self.send_header("Content-type", mimetype)

        self.end_headers()

        if isinstance(data, str):
            data = data.encode("utf-8")

        self.wfile.write(data)

def generate_timeline_data(files):
    results = collect_times_from_org_files(files)
    days = {}
    for path, start, end in sorted(results["clocks"] + results["scheduled"], key=lambda x: x[1]):
        day = start.date().isoformat()
        days[day] = days.get(day, []) + [(path, start, end)]

    result = []
    for day, events in sorted(days.items(), key=lambda x: x[0]):
        day_events = []
        for path, start, end in events:
            if not end:
                end = start + timedelta(seconds=60)

            day_events.append({
                "category": "",
                "start": start.isoformat(),
                "end": end.isoformat(),
                "entry": "->".join(path),
            })

        result.append([day, day_events])

    return result

def create_calendar(files, which):
    results = collect_times_from_org_files(files)
    cal = Calendar()
    cal.add('prodid', '-//serve-org-calendar//v0.1//')
    cal.add('version', '2.0')
    cal.add('calscale', "GREGORIAN")
    cal.add("X-WR-CALNAME;VALUE=TEXT", which)
    cal.add("X-WR-CALDESC;VALUE=TEXT", which + " imported from org-mode")
    min_time = datetime.now(TIMEZONE) - timedelta(days=30)
    max_time = datetime.now(TIMEZONE) + timedelta(days=30)
    for path, dt, dtend in results[which]:
        if dt < min_time or dt > max_time:
            continue

        event = Event()
        headings = [x.strip() for x in path if x.strip()]
        if not headings:
            headings = ["dummy"]
        event.add('summary', headings[-1])
        event.add('description', '\n'.join("*" * i + " " + x for i, x in enumerate(headings)))
        event.add('dtstart', dt)
        if not dtend:
            dtend = dt + timedelta(seconds=15 * 60)
        event.add('dtend', dtend)
        event.add('dtstamp', dt)
        cal.add_component(event)

    return cal.to_ical()

def load_calendars(config):
    calendars = {}
    for section in config.sections():
        if section.startswith("calendar "):
            name = section.split(" ", 1)[1]
            calendars[name] = config[section]
            assert name != "org"
            assert calendars[name]["directory"]
            assert calendars[name]["name"]
            assert calendars[name]["description"]

    return calendars

def serve_calendars(config):
    global calendars_to_serve, org_directory
    calendars_to_serve = load_calendars(config)
    org_directory = config.get("serve", "org_directory")

    if config.has_option("serve", "port"):
        port = config.getint("serve", "port")
    else:
        port = 8991

    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"running server: http://127.0.0.1:{port}/")
    for name, calendar in calendars_to_serve.items():
        print(f"    serving http://127.0.0.1:{port}/calendar/{name}/")
        for w in ORG_CALENDARS:
            print(f"    serving http://127.0.0.1:{port}/org/{w}/")

    httpd.serve_forever()

def import_calendar(config):
    output_file = config.get("import", "output_file")

    if config.has_option("import", "delay"):
        delay = config.getint("import", "delay")
    else:
        delay = 300

    if config.has_option("import", "num_days"):
        num_days = config.getint("import", "num_days")
    else:
        num_days = 30

    if config.has_option("import", "include_end_time"):
        include_end_time = config.getboolean("import", "include_end_time")
    else:
        include_end_time = None

    if config.has_option("import", "include_duration"):
        include_duration = config.getboolean("import", "include_duration")
    else:
        include_duration = None

    if config.has_option("import", "include_calendars"):
        include_calendars = config.get("import", "include_calendars").split()
    else:
        include_calendars = None

    if config.has_option("import", "exclude_calendars"):
        exclude_calendars = config.get("import", "exclude_calendars").split()
    else:
        exclude_calendars = None

    while True:
        start_time = datetime.now() - timedelta(days=num_days)
        end_time = datetime.now() + timedelta(days=num_days)
        events = get_events(
            start_time,
            end_time,
            include_calendars=include_calendars,
            exclude_calendars=exclude_calendars)

        print("importing calendars to org...")
        import_to_org(
            events,
            output_file=output_file,
            include_end_time=include_end_time,
            include_duration=include_duration)

        time.sleep(delay)

def run(args):
    config = ConfigParser()
    config.read(expanduser(args.config))

    serve_thread = threading.Thread(target=serve_calendars, args=(config,))
    import_thread = threading.Thread(target=import_calendar, args=(config,))
    serve_thread.start()
    import_thread.start()

    serve_thread.join()
    import_thread.join()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", "-c", default="~/.sync-org-calendar.conf", help="the config file to load")

    args = parser.parse_args()
    # files = ["~/test.org"]
    # data = create_calendar(files, "deadline")
    # open("test.ics", "wb").write(data)
    run(args)