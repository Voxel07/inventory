#!/usr/bin/env python3
"""Read-only HTTP latency probe; authentication stays in an environment variable."""
import argparse, concurrent.futures, json, math, os, platform, statistics, time, urllib.request

def main():
    p=argparse.ArgumentParser(); p.add_argument('--base-url',required=True); p.add_argument('--path',required=True)
    p.add_argument('--requests',type=int,default=200);p.add_argument('--concurrency',type=int,default=10)
    p.add_argument('--token-env',default='INVENTORY_BENCHMARK_TOKEN');p.add_argument('--output',default='performance-results.json')
    args=p.parse_args()
    if not args.path.startswith('/api/') or not 1<=args.requests<=10000 or not 1<=args.concurrency<=100: p.error('Invalid bounded probe parameters')
    token=os.environ.get(args.token_env)
    headers={'Authorization':'Bearer '+token} if token else {}
    def read(_):
        start=time.perf_counter()
        try:
            with urllib.request.urlopen(urllib.request.Request(args.base_url.rstrip('/')+args.path,headers=headers),timeout=30) as r:
                size=0
                while chunk:=r.read(65536): size+=len(chunk)
                return {'ms':(time.perf_counter()-start)*1000,'status':r.status,'bytes':size}
        except Exception as error: return {'ms':(time.perf_counter()-start)*1000,'status':getattr(error,'code',0),'bytes':0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool: rows=list(pool.map(read,range(args.requests)))
    values=sorted(r['ms'] for r in rows)
    percentile=lambda q:values[max(0,math.ceil(q*len(values))-1)]
    result={'machine':platform.platform(),'requests':len(rows),'concurrency':args.concurrency,'errors':sum(r['status']!=200 for r in rows),
            'p50_ms':statistics.median(values),'p95_ms':percentile(.95),'p99_ms':percentile(.99),'observations':rows}
    with open(args.output,'w') as out:json.dump(result,out,indent=2)
    print(json.dumps({k:v for k,v in result.items() if k!='observations'},indent=2))
    if result['errors']:raise SystemExit(1)

if __name__=='__main__':main()
