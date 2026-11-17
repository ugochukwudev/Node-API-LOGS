import { Request, Response } from "express";
import { Types } from "mongoose";
import JobLog from "../models/joblog.model";
import ApiLogBlob from "../models/apilogblob.model";
import { handleError } from "../utils/error-handlers";
import { getPaginationLimits } from "../utils/query-helpers";
import { escapeRegex } from "../core/search";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_FIELDS = { sessionLogs: 0, payloadRef: 0, resultRef: 0 };

const jobFilter = (query: Request["query"]) => {
	const filter: Record<string, unknown> = {};
	const str = (key: string) => (typeof query[key] === "string" && query[key] ? String(query[key]) : "");
	const from = str("from") && !isNaN(Date.parse(str("from"))) ? new Date(str("from")) : new Date(Date.now() - 7 * DAY_MS);
	filter.queuedAt = { $gte: from };
	if (str("status")) filter.status = { $in: str("status").split(",") };
	if (str("queue")) filter.queue = str("queue");
	if (str("library")) filter.library = str("library");
	if (str("name")) filter.name = { $regex: escapeRegex(str("name")), $options: "i" };
	return filter;
};

export const listJobs = async (req: Request, res: Response) => {
	try {
		const filter = jobFilter(req.query);
		const { maxLimit, maxPage } = getPaginationLimits(req.query.page, req.query.limit);
		const [jobs, total, counts, queues] = await Promise.all([
			JobLog.find(filter, LIST_FIELDS)
				.sort({ queuedAt: -1 })
				.skip((maxPage - 1) * maxLimit)
				.limit(maxLimit)
				.lean(),
			JobLog.countDocuments(filter),
			JobLog.aggregate([
				{ $match: { queuedAt: (filter as any).queuedAt } },
				{ $group: { _id: "$status", count: { $sum: 1 } } },
			]),
			JobLog.distinct("queue"),
		]);
		res.json({
			jobs,
			total,
			counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
			queues: queues.sort(),
		});
	} catch (error) {
		handleError(error, res, "listJobs");
	}
};

export const getJob = async (req: Request, res: Response) => {
	try {
		if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Job not found" });
		const job = await JobLog.findById(req.params.id).lean();
		if (!job) return res.status(404).json({ message: "Job not found" });
		const refs = [job.payloadRef, job.resultRef].filter(Boolean) as string[];
		const blobs = refs.length ? await ApiLogBlob.find({ _id: { $in: refs } }, { data: 1 }).lean() : [];
		const byId = new Map(blobs.map((b) => [b._id, b.data]));
		const { payloadRef, resultRef, ...rest } = job;
		res.json({
			job: {
				...rest,
				payload: payloadRef ? byId.get(payloadRef) ?? null : null,
				result: resultRef ? byId.get(resultRef) ?? null : null,
			},
		});
	} catch (error) {
		handleError(error, res, "getJob");
	}
};

/** Jobs queued while a given request was being handled. */
export const getLogJobs = async (req: Request, res: Response) => {
	try {
		if (!Types.ObjectId.isValid(req.params.id)) return res.json({ jobs: [] });
		const jobs = await JobLog.find({ requestLogId: new Types.ObjectId(req.params.id) }, LIST_FIELDS)
			.sort({ queuedAt: 1 })
			.limit(100)
			.lean();
		res.json({ jobs });
	} catch (error) {
		handleError(error, res, "getLogJobs");
	}
};
