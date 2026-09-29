# do-disconnect-repro

What happens to a Durable Object call when the client of the calling Worker disconnects?

Each route runs a 3 s loop that logs every step to a new Durable Object's storage.
`repro.sh` calls each route, disconnects after 1.2 s, then prints that run's log.

| Route     | Who runs the loop                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `/worker` | The Worker itself, calling the Durable Object only to record each step                                           |
| `/rpc`    | The Durable Object, called with `stub.work()`                                                                    |
| `/fetch`  | The Durable Object's `fetch()` handler, called with `stub.fetch(request)`. It logs when `request.signal` aborts. |

## Run

```sh
npm install
npx wrangler deploy
./repro.sh https://do-disconnect-repro.<subdomain>.workers.dev
```

Run it against a deployed Worker. `wrangler dev` does not pass client disconnects to the
Worker, so every route runs to completion locally.

## Results

Production, compatibility date `2026-09-26`:

| Route     | Log after the client disconnects                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/worker` | Stops at the disconnect. No `finally`.                                                                                      |
| `/rpc`    | All 6 steps, then `finally`.                                                                                                |
| `/fetch`  | All 6 steps, then `finally`. `request.signal` aborts at the disconnect, but only with the `enable_request_signal` flag set. |

Workers Observability records both Durable Object invocations with `outcome: "canceled"`
and a wall time of about 3 s, the full run.
