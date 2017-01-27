var asana = require("asana");
var parseArgs = require("minimist");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var argv = parseArgs(process.argv.slice(2));

var pat = argv.pat;

var projects = argv._;

var client = asana.Client.create({
    asanaBaseUrl: "https://localhost.asana.com:8180/"
}).useAccessToken(pat);

console.log(projects)

projects.forEach(function(project_id) {
    client.projects.findById(project_id, {
        opt_fields: "custom_field_settings.custom_field.description"
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
                console.log(task)

                if (task.id === 172596197007857) {
                    var weighted_value = task.custom_fields.find(function(cf) {
                        return cf.id === 158710296730351;
                    })
                    console.log(weighted_value)

                    weighted_value.number_value = 1;

                    var new_custom_fields_on_task = {};
                    new_custom_fields_on_task[weighted_value.id] = 1;


                    client.tasks.update(task.id, { custom_fields: new_custom_fields_on_task })
                }
            });
        });
    });



});