export interface TestCaseWithIssue {
    issueId?: number | string | undefined;
}

/**
 * Helper function that allows the inclusion of an issue identifier in test descriptions.
 * @typeparam T Type extending the `TestCaseWithIssue` interface.
 * @param description Test description.
 * @returns The final test description, with the issue identifier (if provided).
 */
export function td<T extends TestCaseWithIssue>(description: string, { issueId }: T): string;
/**
 * Helper function that allows the inclusion of an issue identifier in test descriptions.
 * @param description Test description.
 * @param issueId GitHub/GitLab/Jira issue identifier related to the test or test case.
 * @returns The final test description, with the issue identifier (if provided).
 */
export function td(description: string, issueId?: number | string | undefined): string;
export function td<T extends TestCaseWithIssue>(description: string, issueIdSource?: T | TestCaseWithIssue['issueId']): string {
    let issueId: number | string | undefined;
    if (typeof issueIdSource !== 'object') {
        issueId = issueIdSource;
    }
    else {
        issueId = issueIdSource.issueId;
    }
    if (issueId !== undefined) {
        return `#${issueId}: ${description}`;
    }
    return description;
}
