/**
 * Template Engine for Hybrid Template Generation
 * 
 * Uses semantic role tags (from State.categoryTags) to fill template patterns
 * with wildcards from user's categories.
 */

// TODO: Allow users to create and save custom template patterns
// TODO: Add template pattern editor UI in settings

// TODO: Add support for nested/conditional template patterns

import { State } from './state.js';

/**
 * Template patterns with weights, required/optional roles, and Smart Phrases.
 * Higher weight = more likely to be selected.
 */
const TEMPLATE_PATTERNS = [
    // Subject-focused templates (most common)
    {
        id: 'subject_basic',
        pattern: '{Subject}',
        requiredRoles: ['Subject'],
        optionalRoles: [],
        weight: 5,
        phrases: {}
    },
    {
        id: 'subject_style',
        pattern: '{Subject}, {Style:phrase}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Style'],
        weight: 15,
        phrases: {
            Style: ['{Style} style', 'in the style of {Style}', '{Style} aesthetic']
        }
    },
    {
        id: 'subject_location',
        pattern: '{Subject} {Location:phrase}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Location'],
        weight: 20,
        phrases: {
            Location: ['in {Location}', 'at {Location}', 'surrounded by {Location}']
        }
    },
    {
        id: 'subject_location_style',
        pattern: '{Subject} {Location:phrase}, {Style:phrase}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Location', 'Style'],
        weight: 25,
        phrases: {
            Location: ['in {Location}', 'standing in {Location}', 'inside {Location}'],
            Style: ['{Style} style', 'rendered in {Style}', '{Style}']
        }
    },
    {
        id: 'subject_modifier',
        pattern: '{Modifier} {Subject}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Modifier'],
        weight: 15,
        phrases: {}
    },
    {
        id: 'subject_wearable',
        pattern: '{Subject} wearing {Wearable}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Wearable'],
        weight: 12,
        phrases: {},
        combos: { 'Subject:Person': ['Wearable'] }
    },
    {
        id: 'subject_action',
        pattern: '{Subject} {Action:phrase}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Action'],
        weight: 10,
        phrases: {
            Action: ['{Action}', 'in a {Action} pose', 'with {Action} expression']
        }
    },
    {
        id: 'subject_object',
        pattern: '{Subject} with {Object}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Object'],
        weight: 10,
        phrases: {}
    },

    // Complex multi-role templates
    {
        id: 'full_scene',
        pattern: '{Modifier} {Subject} {Location:phrase}, {Style:phrase}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Modifier', 'Location', 'Style'],
        weight: 20,
        phrases: {
            Location: ['in {Location}', 'within {Location}'],
            Style: ['{Style} style', 'inspired by {Style}']
        }
    },
    {
        id: 'action_scene',
        pattern: '{Subject} {Action:phrase} {Location:phrase}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Action', 'Location'],
        weight: 12,
        phrases: {
            Action: ['{Action}', 'performing {Action}'],
            Location: ['in {Location}', 'at {Location}']
        }
    },
    {
        id: 'styled_portrait',
        pattern: '{Subject} wearing {Wearable}, {Modifier} lighting, {Style:phrase}',
        requiredRoles: ['Subject'],
        optionalRoles: ['Wearable', 'Modifier', 'Style'],
        weight: 15,
        phrases: {
            Style: ['{Style}', '{Style} aesthetic']
        },
        combos: { 'Subject:Person': ['Wearable'] }
    },
    {
        id: 'object_scene',
        pattern: '{Object} {Location:phrase}',
        requiredRoles: ['Object'],
        optionalRoles: ['Location'],
        weight: 8,
        phrases: {
            Location: ['in {Location}', 'placed in {Location}', 'floating in {Location}']
        }
    },
    {
        id: 'location_mood',
        pattern: '{Modifier} {Location}',
        requiredRoles: ['Location'],
        optionalRoles: ['Modifier'],
        weight: 8,
        phrases: {}
    },

    // Minimal fallback templates
    {
        id: 'minimal_subject',
        pattern: '{Subject}',
        requiredRoles: ['Subject'],
        optionalRoles: [],
        weight: 2,
        phrases: {},
        isFallback: true
    },
    {
        id: 'minimal_location',
        pattern: '{Location}',
        requiredRoles: ['Location'],
        optionalRoles: [],
        weight: 2,
        phrases: {},
        isFallback: true
    }
];

/**
 * Template Engine - generates prompts by filling template slots with wildcards
 */
export const TemplateEngine = {
    /**
     * Generate templates using the hybrid system
     * @param {number} count - Number of templates to generate
     * @param {'strict'|'wildcard'|'hybrid'} mode - Generation mode
     * @param {Object} [options] - Additional options
     * @returns {string[]} Array of generated template strings
     */
    generate(count, mode = 'wildcard', options = {}) {
        const roleIndex = State.buildRoleIndex();

        // Optional: filter to specific paths
        if (options.filterPaths?.length) {
            const allowedPaths = new Set(options.filterPaths);
            for (const role of Object.keys(roleIndex)) {
                roleIndex[role] = roleIndex[role].filter(c => allowedPaths.has(c.path));
            }
        }

        const availableRoles = Object.keys(roleIndex).filter(role => roleIndex[role].length > 0);

        if (availableRoles.length === 0) {
            console.warn('No tagged categories available. Run "Analyze Categories" first.');
            return [];
        }

        // Filter templates that can be filled with available roles
        const usableTemplates = TEMPLATE_PATTERNS.filter(t =>
            t.requiredRoles.every(role => availableRoles.includes(role))
        );

        if (usableTemplates.length === 0) {
            console.warn('No usable templates for available roles:', availableRoles);
            return [];
        }

        // Generate templates
        const results = [];
        const seen = new Set();

        for (let i = 0; i < count * 3 && results.length < count; i++) {
            const template = this._selectWeightedTemplate(usableTemplates, roleIndex);
            const filled = this._fillTemplate(template, roleIndex, mode);

            // Deduplicate
            if (filled && !seen.has(filled)) {
                seen.add(filled);
                results.push(filled);
            }
        }

        // TODO: Add option to prefer unused categories for variety
        // TODO: Track generation history to avoid repeating similar templates
        // TODO: Add "style presets" (e.g., portrait, landscape, action) that bias template selection
        return results;
    },

    /**
     * Select a template using weighted random selection
     * @private
     */
    _selectWeightedTemplate(templates, roleIndex) {
        // Calculate effective weights (boost for more filled optional slots)
        const weights = templates.map(t => {
            const filledOptional = t.optionalRoles.filter(role =>
                roleIndex[role] && roleIndex[role].length > 0
            ).length;
            const optionalBonus = 1 + (filledOptional * 0.2);
            return t.weight * optionalBonus;
        });

        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < templates.length; i++) {
            random -= weights[i];
            if (random <= 0) return templates[i];
        }

        return templates[0];
    },

    /**
     * Fill a template with actual wildcard paths
     * @private
     */
    _fillTemplate(template, roleIndex, mode) {
        let result = template.pattern;

        // Find all {Role} and {Role:phrase} placeholders
        const placeholders = result.match(/\{(\w+)(?::phrase)?\}/g) || [];
        const placeholderRegex = /\{(\w+)(:phrase)?\}/;

        for (const placeholder of placeholders) {
            const match = placeholder.match(placeholderRegex);
            if (!match) continue;

            const role = match[1];
            const usePhrase = match[2] === ':phrase';

            // Get available categories for this role
            const categories = roleIndex[role];
            if (!categories || categories.length === 0) {
                // Remove unfillable optional slots
                result = result.replace(placeholder, '').replace(/\s+/g, ' ').trim();
                continue;
            }

            // Random selection from available categories
            const selected = categories[Math.floor(Math.random() * categories.length)];

            // Format based on mode
            let replacement;
            if (mode === 'strict') {
                // Use path directly (for display/testing)
                replacement = selected.path.split('/').pop().replace(/_/g, ' ');
            } else {
                // Wildcard format: ~~path~~
                replacement = `~~${selected.path}~~`;
            }

            // Apply Smart Phrase if requested
            if (usePhrase && template.phrases[role]) {
                const phrases = template.phrases[role];
                const phrase = phrases[Math.floor(Math.random() * phrases.length)];
                replacement = phrase.replace(`{${role}}`, replacement);
            }

            result = result.replace(placeholder, replacement);
        }

        // Clean up extra spaces and commas
        result = result
            .replace(/,\s*,/g, ',')
            .replace(/^\s*,|,\s*$/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return result || null;
    },

    /**
     * Get available template patterns for UI display
     */
    getPatterns() {
        return TEMPLATE_PATTERNS.map(t => ({
            id: t.id,
            pattern: t.pattern,
            requiredRoles: t.requiredRoles,
            weight: t.weight
        }));
    },

    /**
     * Check if templates can be generated with current tags
     * @returns {{canGenerate: boolean, missingRoles: string[], availableRoles: string[]}}
     */
    checkReadiness() {
        const roleIndex = State.buildRoleIndex();
        const availableRoles = Object.keys(roleIndex).filter(role => roleIndex[role].length > 0);

        // Check if at least Subject or Location is available
        const hasSubject = availableRoles.includes('Subject');
        const hasLocation = availableRoles.includes('Location');

        return {
            canGenerate: hasSubject || hasLocation,
            availableRoles,
            missingRoles: ['Subject', 'Location', 'Style', 'Modifier'].filter(r => !availableRoles.includes(r))
        };
    }
};
