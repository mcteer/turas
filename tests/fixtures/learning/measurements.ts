/** Independently chosen paired observations; expected changes are authored constants. */
export const learningMeasurementExamples=[
 {customer:'improved',baseline:{deployments:100,totalMinutes:'2000',failedDeployments:null},current:{deployments:100,totalMinutes:'1000',failedDeployments:null},expectedChange:'-10.00'},
 {customer:'worsened',baseline:{deployments:1,totalMinutes:'10',failedDeployments:null},current:{deployments:1,totalMinutes:'30',failedDeployments:null},expectedChange:'20.00'},
 {customer:'unchanged',baseline:{deployments:1,totalMinutes:'7',failedDeployments:null},current:{deployments:1,totalMinutes:'7',failedDeployments:null},expectedChange:'0.00'},
 {customer:'missing',baseline:{deployments:0,totalMinutes:'0',failedDeployments:null},current:{deployments:1,totalMinutes:'1',failedDeployments:null},expectedChange:null},
] as const;
export const learningMeasurementExpectedMean='3.33';
export const learningPrivacyPopulationSizes={suppressed:4,minimum:5} as const;
