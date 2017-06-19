#! /usr/bin/env python2

import re
import sys
import json
import base64
import urllib

REX = re.compile(r'log\.api\?(.+) HTTP/1\.1')

inputs = sys.argv[1]
outputs = sys.argv[2]

with open(inputs) as fr:
    text = fr.read()
records = REX.findall(text)

errors = 0

with open(outputs, 'w') as fw:
    for record in records:
        event = {}
        try:
            items = record.split('&')
            for item in items:
                k, v = item.split('=', 1)
                event[k] = v

            if event['event'] != 'convert':
                continue

            pois_d = {}
            for k in event.keys():
                if k.startswith('poi.'):
                    _, pi, pk = k.split('.', 2)
                    pi = int(pi)
                    if pi not in pois_d:
                        pois_d[pi] = {}

                    if pk.startswith('point.'):
                        if 'point' not in pois_d[pi]:
                            pois_d[pi]['point'] = {}
                        _, pk = pk.split('.')
                        pois_d[pi]['point'][pk] = event.pop(k)
                    else:
                        pois_d[pi][pk] = event.pop(k)
            event['pois'] = [pois_d[i] for i in sorted(pois_d.keys())]

            event['province'] = urllib.unquote(event['province'])
            event['city'] = urllib.unquote(event['city'])
            event['keyword'] = urllib.unquote(event['keyword'])
            event['more_results_url'] = base64.decodestring(bytes(event['more_results_url']))
            event['timestamp'] = float(event['timestamp'])

            for poi in event['pois']:
                poi['address'] = urllib.unquote(poi['address'])
                poi['city'] = urllib.unquote(poi['city'])
                poi['province'] = urllib.unquote(poi['province'])
                poi['tags'] = urllib.unquote(poi['tags']).split(';')
                poi['title'] = urllib.unquote(poi['title'])
                poi['point']['latitude'] = float(poi['point']['latitude'])
                poi['point']['longitude'] = float(poi['point']['longitude'])
                poi['url'] = base64.decodestring(bytes(poi.get('url', '')))

            fw.write(json.dumps(event)+'\n')
            fw.flush()
        except Exception as ex:
            errors += 1

if errors > 0:
    sys.stderr.write('parse error {} lines\n'.format(errors))
