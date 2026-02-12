export function safeJsonParse(jsonString: string): any {
    if (!jsonString || typeof jsonString !== 'string') {
        return jsonString;
    }

    try {
        if (
            jsonString.startsWith('"') &&
            jsonString.endsWith('"') &&
            !jsonString.startsWith('""')
        ) {
            const innerString = jsonString.slice(1, -1);           

            return JSON.parse(innerString);
        }
       
        const unescaped = jsonString
            .replace(/\\"/g, '"') 
            .replace(/\\n/g, '\n') 
            .replace(/\\\\/g, '\\'); 

        return JSON.parse(unescaped);
    } catch (e) {       
        return jsonString;
    }
}


export function parseNestedJson(obj: any, maxDepth = 3, currentDepth = 0): any {
    if (currentDepth >= maxDepth) {
        return obj;
    }

    if (typeof obj === 'string') {
        return safeJsonParse(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map((item) =>
            parseNestedJson(item, maxDepth, currentDepth + 1),
        );
    }

    if (obj && typeof obj === 'object') {
        const parsed: any = {};
        for (const [key, value] of Object.entries(obj)) {
            parsed[key] = parseNestedJson(value, maxDepth, currentDepth + 1);
        }
        return parsed;
    }

    return obj;
}

export function formatExecutionDataForDisplay(
    executionData: Record<string, any>,
): Record<string, any> {
    if (!executionData || typeof executionData !== 'object') {
        return executionData;
    }
    
    const dataCopy = JSON.parse(JSON.stringify(executionData));
    
    Object.keys(dataCopy).forEach((field) => {
        if (dataCopy[field] && typeof dataCopy[field] === 'string') {
            const value = dataCopy[field].trim();
           
            if (
                (value.startsWith('{') && value.endsWith('}')) ||
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith('""') && value.endsWith('""'))
            ) {
                dataCopy[field] = safeJsonParse(dataCopy[field]);
            }
        }
    });

    return dataCopy;
}
