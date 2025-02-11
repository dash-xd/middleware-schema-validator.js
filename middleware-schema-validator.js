const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const path = require("path");
const fs = require("fs");

const ajv = new Ajv({ allErrors: true });
addFormats(ajv); // ✅ Enables "email", "date-time", "uri", etc.

const validatorsCache = {};

/**
 * Loads and compiles a schema if it exists.
 * @param {string} filePath - Path to the schema file.
 * @returns {Function|null} - Returns compiled validator function or null if file doesn't exist.
 */
const getValidator = (filePath) => {
    if (!fs.existsSync(filePath)) {
        console.warn(`[Schema Validator] Warning: Schema file not found: ${filePath}`);
        return null;
    }

    if (!validatorsCache[filePath]) {
        validatorsCache[filePath] = ajv.compile(require(filePath));
    }
    return validatorsCache[filePath];
};

/**
 * Validates request data against a schema.
 * @param {Function} validator - The compiled AJV validator function.
 * @param {Object} data - The request data to validate.
 * @returns {Object|null} - Returns error object if validation fails, otherwise null.
 */
const validateData = (validator, data) => {
    if (validator && !validator(data)) {
        return { errors: validator.errors };
    }
    return null;
};

const schemaValidator = async (req, res, next) => {
    try {
        const method = req.method.toUpperCase();
        const endpointParts = req.baseUrl.split('/').filter(Boolean);
        const lastSegment = req.path.split('/').filter(Boolean).pop();

        const validationTargets = {
            body: req.body,
            query: req.query,
            params: req.params
        };

        /**
         * Example file structure:
         * ./openapi.yaml -- not needed for the middleware to work - references the json schemas
         * ./schemas/api/v1/admin/GET_users_claims.query.json
         * ./schemas/api/v1/admin/POST_users_claims_query.json
         * ./schemas/api/v1/admin/POST_users_claims_body.json
         * etc.
         */
        const schemaDir = path.join(__dirname, "./schemas", ...endpointParts);

        for (const [key, data] of Object.entries(validationTargets)) {
            const schemaFile = `${method}_${lastSegment}_${key}.json`;
            const filePath = path.join(schemaDir, schemaFile);

            console.log(`[Schema Validator] Checking for schema: ${filePath}`);
            const validator = getValidator(filePath);

            if (!validator) {
                console.warn(`[Schema Validator] No schema found for ${method} ${req.baseUrl}${req.path} (${key}). Skipping validation.`);
                continue;
            }

            console.log("[Schema Validator] Validating against OpenAPI spec...");
            const validationError = validateData(validator, data);
            if (validationError) {
                console.error("[Schema Validator] Validation failed:", validationError);
                return res.status(400).json(validationError);
            }
            console.log("[Schema Validator] Validating against OpenAPI spec...");
        }

        next();
    } catch (error) {
        console.error("[Schema Validator] Error in schema validation:", error);
        return res.status(500).json({ error: "Schema validation failed." });
    }
};

module.exports = schemaValidator;
