var asana = require("asana");
var parseArgs = require("minimist");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var argv = parseArgs(process.argv.slice(2));

var pat = argv.pat;

var projects = argv._;

var client = asana.Client.create({
    asanaBaseUrl: "https://localhost.asana.com:8180/"
}).useAccessToken(pat);

projects.forEach(function(project_id) {
    client.projects.findById(project_id, {
        // TODO name is only here for debugging
        opt_fields: "custom_field_settings.custom_field.name,custom_field_settings.custom_field.description"
    }).then(function(project) {

        var fields = project.custom_field_settings.map(function(cfs) {
            return cfs.custom_field;
        });

        var formula_fields = fields.filter(function(custom_field) {
            return custom_field.description.startsWith("=");
        });

        client.tasks.findByProject(project_id, {
            opt_fields: "name,completed,custom_fields"
        }).then(function(tasks_collection) {
            tasks_collection.stream().on("data", function(task) {
                var task_field_values_by_name = {};
                task.custom_fields.forEach(function(custom_field) {
                   task_field_values_by_name[custom_field.name] = custom_field;
                });

                var calc = function(formula_object) {
                    switch (typeof formula_object) {
                        case "object":
                            console.assert(Array.isArray(formula_object), "Invalid formula field", formula_object);

                            // Recursive case, this is another formula
                            var xs = formula_object;
                            switch (xs.length) {
                                case 2:
                                    switch (xs[0]) {
                                        case "!":
                                            return !calc(xs[1]);
                                        case "-":
                                            return -calc(xs[1]);
                                        default:
                                            throw new Error("Couldn't parse expression with 2 tokens");
                                    }
                                case 3:
                                    switch (xs[1]) {
                                        case "+":
                                            return calc(xs[0]) + calc(xs[2]);
                                        case "-":
                                            return calc(xs[0]) - calc(xs[2]);
                                        case "*":
                                            return calc(xs[0]) * calc(xs[2]);
                                        case "/":
                                            return calc(xs[0]) / calc(xs[2]);
                                        case "=":
                                        case "==":
                                        case "===":
                                            return calc(xs[0]) === calc(xs[2]);
                                        case "!=":
                                        case "!==":
                                        case "<>": //Yeah basic!
                                            return calc(xs[0]) !== calc(xs[2]);
                                        case ">":
                                            return calc(xs[0]) > calc(xs[2]);
                                        case ">=":
                                            return calc(xs[0]) >= calc(xs[2]);
                                        case "<":
                                            return calc(xs[0]) < calc(xs[2]);
                                        case "<=":
                                            return calc(xs[0]) <= calc(xs[2]);
                                        case "&&":
                                            return calc(xs[0]) && calc(xs[2]);
                                        case "||":
                                            return calc(xs[0]) || calc(xs[2]);
                                        default:
                                            throw new Error("Couldn't parse expression with 3 tokens");
                                    }
                                case 5:
                                    if (xs[1] === "?" && xs[3] === ":") {
                                        // Ternary if operator. We use javascript's truthiness
                                        return calc(xs[0]) ? calc(xs[2]) : calc(xs[4]);
                                    } else {
                                        throw new Error("Couldn't parse expression with 5 tokens");
                                    }
                                default:
                                    throw new Error("Couldn't parse expression, unused number of tokens");
                            }

                        case "string":
                            // A reference to another custom field, hopefully
                            // TODO make sure the other property got calculated before this one?
                            // Could just rely on it running repetitively
                            var field_value = task_field_values_by_name[formula_object];
                            if ((field_value === null) || (field_value === undefined)) {
                                // Referenced a field that this task doesn't have, use NaN to not write any value
                                return NaN;
                            } else if (field_value.number_value !== undefined) {
                                if (field_value.number_value === null) {
                                    // This field is blank for this task, use NaN to not write any value
                                    return NaN;
                                } else {
                                    return field_value.number_value;
                                }
                            } else if (field_value.text ) {
                                // Assume everything is a date and return the number of days
                                return Date.parse(field_value.text) / Date.MILLISECONDS_PER_DAY;
                            } else {
                                throw new Error("Unexpected type of custom property", field_value);
                            }

                        case "number":
                            // A literal
                            return formula_object;

                        default:
                    }
                };

                var new_custom_field_values_to_write_to_task = {};
                var any_new_custom_field_values_to_write = false;
                formula_fields.forEach(function(field) {
                    var formula_json = field.description.substring(1);
                    var formula_object = JSON.parse(formula_json);
                    var formula_value = calc(formula_object);
                    console.log("Formula value", task.name, field.name, formula_value);
                    if (!isNaN(formula_value)) {
                        // TODO defend against formula fields not being numbers
                        var existing_value = task_field_values_by_name[field.name].number_value;
                        if (existing_value !== formula_value) {
                            new_custom_field_values_to_write_to_task[field.id] = formula_value;
                            any_new_custom_field_values_to_write = true;
                        }
                    }
                });

                if (any_new_custom_field_values_to_write) {
                    client.tasks.update(task.id, {custom_fields: new_custom_field_values_to_write_to_task});
                }
            });
        });
    });



});