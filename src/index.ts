import { DurableObject } from "cloudflare:workers";

// Each run takes STEPS * STEP_MS (3 s) and logs every step, so the log shows
// how far a run got after the client disconnected.
const STEPS = 6;
const STEP_MS = 500;

type LogRow = { ms: number; event: string };

async function run(
	tag: string,
	log: (event: string) => unknown,
): Promise<string> {
	await log(`${tag}: start`);
	try {
		for (let i = 1; i <= STEPS; i++) {
			await scheduler.wait(STEP_MS);
			await log(`${tag}: step ${i}/${STEPS}`);
		}
		return "done\n";
	} finally {
		await log(`${tag}: finally`);
	}
}

export class Repro extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(
			"CREATE TABLE IF NOT EXISTS log (t INTEGER, event TEXT)",
		);
	}

	log(event: string): void {
		this.ctx.storage.sql.exec(
			"INSERT INTO log VALUES (?, ?)",
			Date.now(),
			event,
		);
	}

	status(): string {
		const rows = this.ctx.storage.sql.exec<LogRow>(
			"SELECT t - (SELECT min(t) FROM log) AS ms, event FROM log ORDER BY rowid",
		);
		return rows
			.toArray()
			.map((row) => `+${row.ms}ms ${row.event}\n`)
			.join("");
	}

	work(): Promise<string> {
		return run("rpc", (event) => this.log(event));
	}

	async fetch(request: Request): Promise<Response> {
		request.signal.addEventListener("abort", () =>
			this.log("fetch: request.signal aborted"),
		);
		return new Response(await run("fetch", (event) => this.log(event)));
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const id = url.searchParams.get("run");
		if (!id) {
			return new Response("usage: /{worker,rpc,fetch,status}?run=<id>\n", {
				status: 400,
			});
		}
		// One Durable Object per run, so each log holds a single run.
		const stub = env.REPRO.getByName(id);

		switch (url.pathname) {
			// The Worker runs the steps itself and records them in the Durable Object.
			case "/worker":
				return new Response(await run("worker", (event) => stub.log(event)));
			case "/rpc":
				return new Response(await stub.work());
			case "/fetch":
				return stub.fetch(request);
			case "/status":
				return new Response(await stub.status());
			default:
				return new Response("not found\n", { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;
