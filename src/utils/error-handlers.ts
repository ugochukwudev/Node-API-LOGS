import { Response } from "express";

/**
 * Handle MongoDB timeout errors
 */
export const handleTimeoutError = (error: any, res: Response): boolean => {
	if (error.code === 50 || error.codeName === "MaxTimeMSExpired") {
		res.status(504).json({
			message: "Query timeout - try narrowing your search criteria",
			error: "The search query took too long. Please use more specific filters (date range, endpoint, status).",
		});
		return true;
	}
	return false;
};

/**
 * Handle general errors with consistent format
 */
export const handleError = (error: any, res: Response, context: string): void => {
	console.error(`${context} error:`, error);
	
	if (handleTimeoutError(error, res)) {
		return;
	}

	res.status(500).json({ 
		message: `Server error: ${error.message || error}` 
	});
};

