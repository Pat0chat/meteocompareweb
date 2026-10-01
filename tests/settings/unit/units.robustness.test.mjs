import assert from 'node:assert/strict';
import {
  DEFAULT_UNIT_SYSTEM,
  UNIT_SYSTEMS,
  normalizeUnitSystem,
  isImperial,
  convertTemperature,
  convertWind,
  convertPrecipitation,
  convertDistance,
  convertLength,
  convertPressure,
  convertUnitValue,
  unitSymbol,
  unitDigits,
  chartMetricKind,
  convertChartMetric,
  convertChartMetricDelta,
  chartMetricUnitFor,
  chartMetricDigitsFor,
} from '../../../js/units.js';

const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≉ ${expected}`);

assert.equal(DEFAULT_UNIT_SYSTEM,'METRIC');
assert.deepEqual(UNIT_SYSTEMS,['METRIC','IMPERIAL']);
for(const value of [undefined,null,'','unknown','METRIC','metric',' metric '])assert.equal(normalizeUnitSystem(value),'METRIC');
for(const value of ['IMPERIAL','imperial',' imperial '])assert.equal(normalizeUnitSystem(value),'IMPERIAL');
assert.equal(isImperial('metric'),false);assert.equal(isImperial('imperial'),true);

// Metric is the canonical storage / calculation system: conversion must be identity.
for(const value of [-40,-1,0,.1,1,12.345,100,1013.25]){
  assert.equal(convertTemperature(value,'METRIC'),value);
  assert.equal(convertTemperature(value,'METRIC',{delta:true}),value);
  assert.equal(convertWind(value,'METRIC'),value);
  assert.equal(convertPrecipitation(value,'METRIC'),value);
  assert.equal(convertDistance(value,'METRIC'),value);
  assert.equal(convertLength(value,'METRIC'),value);
  assert.equal(convertPressure(value,'METRIC'),value);
}

// Absolute temperatures and temperature deltas must never share the offset conversion.
assert.equal(convertTemperature(-40,'IMPERIAL'),-40);
assert.equal(convertTemperature(0,'IMPERIAL'),32);
assert.equal(convertTemperature(37,'IMPERIAL'),98.6);
assert.equal(convertTemperature(100,'IMPERIAL'),212);
assert.equal(convertTemperature(0,'IMPERIAL',{delta:true}),0);
assert.equal(convertTemperature(10,'IMPERIAL',{delta:true}),18);
assert.equal(convertTemperature(-10,'IMPERIAL',{delta:true}),-18);

close(convertWind(1,'IMPERIAL'),0.621371192237334,1e-12);
close(convertWind(160.9344,'IMPERIAL'),100,2e-5);
close(convertPrecipitation(.1,'IMPERIAL'),0.003937007874015748,1e-12);
close(convertPrecipitation(25.4,'IMPERIAL'),1,1e-12);
close(convertPrecipitation(254,'IMPERIAL'),10,1e-12);
close(convertDistance(1,'IMPERIAL'),0.621371192237334,1e-12);
close(convertDistance(100,'IMPERIAL'),62.1371192237334,1e-10);
close(convertLength(.3048,'IMPERIAL'),1,1e-12);
close(convertLength(1,'IMPERIAL'),3.28083989501312,1e-12);
close(convertPressure(1013.25,'IMPERIAL'),29.921255347142,1e-9);

for(const invalid of [NaN,Infinity,-Infinity,null,undefined,'12']){
  assert.equal(convertTemperature(invalid,'IMPERIAL'),null);
  assert.equal(convertWind(invalid,'IMPERIAL'),null);
  assert.equal(convertPrecipitation(invalid,'IMPERIAL'),null);
  assert.equal(convertDistance(invalid,'IMPERIAL'),null);
  assert.equal(convertLength(invalid,'IMPERIAL'),null);
  assert.equal(convertPressure(invalid,'IMPERIAL'),null);
}

const dispatchCases=[
  ['temperature',20,68],['temperatureDelta',5,9],['wind',100,62.1371192237334],
  ['precipitation',25.4,1],['precipitationRate',25.4,1],['distance',1,.621371192237334],
  ['length',.3048,1],['pressure',1013.25,29.921255347142],
];
for(const [kind,input,expected] of dispatchCases)close(convertUnitValue(kind,input,'IMPERIAL'),expected,1e-9);
assert.equal(convertUnitValue('percentage',42,'IMPERIAL'),42);
assert.equal(convertUnitValue('unknown',NaN,'IMPERIAL'),null);

const symbols={
  temperature:['°C','°F'],temperatureDelta:['°C','°F'],wind:['km/h','mph'],precipitation:['mm','in'],
  precipitationRate:['mm/h','in/h'],distance:['km','mi'],length:['m','ft'],pressure:['hPa','inHg'],
};
for(const [kind,[metric,imperial]] of Object.entries(symbols)){
  assert.equal(unitSymbol(kind,'METRIC'),metric,kind);
  assert.equal(unitSymbol(kind,'IMPERIAL'),imperial,kind);
}
assert.equal(unitSymbol('unknown','IMPERIAL'),'');

assert.equal(unitDigits('temperature','METRIC'),1);
assert.equal(unitDigits('temperature','IMPERIAL',{compact:true}),0);
assert.equal(unitDigits('wind','IMPERIAL'),0);
assert.equal(unitDigits('precipitation','METRIC'),1);
assert.equal(unitDigits('precipitation','IMPERIAL'),2);
assert.equal(unitDigits('precipitationRate','IMPERIAL'),3);
assert.equal(unitDigits('distance','IMPERIAL'),1);
assert.equal(unitDigits('distance','IMPERIAL',{compact:true}),0);
assert.equal(unitDigits('length','METRIC'),2);
assert.equal(unitDigits('length','IMPERIAL',{compact:true}),1);
assert.equal(unitDigits('pressure','METRIC'),0);
assert.equal(unitDigits('pressure','IMPERIAL'),2);

assert.equal(chartMetricKind('TEMPERATURE'),'temperature');
assert.equal(chartMetricKind('PRECIPITATION'),'precipitation');
assert.equal(chartMetricKind('WIND'),'wind');
assert.equal(chartMetricKind('GUST'),'wind');
assert.equal(chartMetricKind('AGREEMENT'),null);
assert.equal(convertChartMetric('TEMPERATURE',0,'IMPERIAL'),32);
close(convertChartMetric('PRECIPITATION',25.4,'IMPERIAL'),1,1e-12);
close(convertChartMetric('WIND',100,'IMPERIAL'),62.1371192237334,1e-10);
close(convertChartMetric('GUST',100,'IMPERIAL'),62.1371192237334,1e-10);
assert.equal(convertChartMetric('AGREEMENT',75,'IMPERIAL'),75);

// Chart spans are deltas: the °F offset must not inflate a 2 °C range to 35.6 °F.
assert.equal(convertChartMetricDelta('TEMPERATURE',2,'IMPERIAL'),3.6);
close(convertChartMetricDelta('PRECIPITATION',1,'IMPERIAL'),1/25.4,1e-12);
close(convertChartMetricDelta('WIND',1,'IMPERIAL'),0.621371192237334,1e-12);
assert.equal(convertChartMetricDelta('AGREEMENT',10,'IMPERIAL'),10);

assert.equal(chartMetricUnitFor('TEMPERATURE','IMPERIAL'),'°F');
assert.equal(chartMetricUnitFor('PRECIPITATION','IMPERIAL'),'in');
assert.equal(chartMetricUnitFor('WIND','IMPERIAL'),'mph');
assert.equal(chartMetricUnitFor('GUST','IMPERIAL'),'mph');
for(const metric of ['PRECIPITATION_PROBABILITY','CLOUD','AGREEMENT'])assert.equal(chartMetricUnitFor(metric,'IMPERIAL'),'%');
assert.equal(chartMetricUnitFor('UNKNOWN','IMPERIAL'),'','unknown chart metrics must never be mislabeled as percentages');
assert.equal(chartMetricDigitsFor('TEMPERATURE','IMPERIAL'),0);
assert.equal(chartMetricDigitsFor('PRECIPITATION','IMPERIAL'),2);
assert.equal(chartMetricDigitsFor('WIND','IMPERIAL'),0);
assert.equal(chartMetricDigitsFor('AGREEMENT','IMPERIAL'),0);

console.log('units robustness: OK');
