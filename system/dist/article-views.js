(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicArticleViews=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const profiles={
  "1": {
    "id": "1",
    "title": "Implemented system design",
    "query": "v=4&lang=en&catalog=all-catalogs&snapshot=sha256%3A2b38efe4c043bcc4a73907944e3b40b94e9796d2fe8a55e2dd627ba99e4c96fd&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&from=2010&to=2025&min=4.5&max=10&depth=1000&c=65.24766%2C-125.06112%2C2.5&tab=methods",
    "tab": "methods",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 7107,
    "fitRecords": true,
    "tectonics": true,
    "focus": ".architecture-panel"
  },
  "2": {
    "id": "2",
    "title": "Home · four-source heat view",
    "query": "v=4&lang=en&catalog=all-catalogs&snapshot=sha256%3A2b38efe4c043bcc4a73907944e3b40b94e9796d2fe8a55e2dd627ba99e4c96fd&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&from=1900&to=2026&min=3.5&max=10&depth=1000&tab=home&c=65%2C-123%2C2.5&display=heat",
    "tab": "home",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 287936,
    "tectonics": true
  },
  "3": {
    "id": "3",
    "title": "Sources · Atlas",
    "query": "v=3&lang=en&catalog=ssn-mx-historical&snapshot=sha256%3A0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993&from=1900&to=2026&min=3.5&max=10&depth=1000&tab=sources&c=23%2C-102%2C4.5",
    "tab": "sources",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 242288,
    "sourceView": "atlas"
  },
  "3-time": {
    "id": "3-time",
    "title": "Sources · Time and coverage",
    "query": "v=3&lang=en&catalog=nrcan-ca-historical&snapshot=sha256%3Af10b91ddbc683406e2f1a642aa8a15fba3d1b46eef3a775f2798cfdc75a31241&from=1985&to=2019&min=3.5&max=10&depth=1000&tab=sources&c=61%2C-115%2C3",
    "tab": "sources",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 6613,
    "sourceView": "time"
  },
  "4a": {
    "id": "4a",
    "title": "Mexico · SSN · partial2026",
    "query": "v=3&lang=en&catalog=ssn-mx-historical&snapshot=sha256%3A0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993&from=2026&to=2026&min=4.5&max=10&depth=1000&c=24.97588%2C-103.0209%2C4.75&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 204,
    "expanded": true,
    "tectonics": false
  },
  "4b": {
    "id": "4b",
    "title": "United States · USGS",
    "query": "v=4&lang=en&catalog=usgs-na-2020-2025&snapshot=8fe055ffe635875f7290906d45f70562a7896621&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&from=2020&to=2025&min=3.5&max=10&depth=1000&country=USA&c=50.70599%2C-124.86544%2C3.25&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 2335,
    "expanded": true,
    "tectonics": false
  },
  "4c": {
    "id": "4c",
    "title": "Canada · NRCan",
    "query": "v=4&lang=en&catalog=nrcan-ca-historical&snapshot=sha256%3Af10b91ddbc683406e2f1a642aa8a15fba3d1b46eef3a775f2798cfdc75a31241&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&from=1985&to=2019&min=3.5&max=10&depth=1000&country=CAN&c=69.59712%2C-125.0224%2C2.75&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 1492,
    "expanded": true,
    "tectonics": false
  },
  "4d": {
    "id": "4d",
    "title": "Four catalogues ·2010–2025",
    "query": "v=4&lang=en&catalog=all-catalogs&snapshot=sha256%3A2b38efe4c043bcc4a73907944e3b40b94e9796d2fe8a55e2dd627ba99e4c96fd&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&from=2010&to=2025&min=4.5&max=10&depth=1000&c=65%2C-123%2C2.75&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 7107,
    "expanded": true,
    "tectonics": true
  },
  "5": {
    "id": "5",
    "title": "Guerrero · descriptive statistics",
    "query": "v=5&lang=en&catalog=ssn-mx-historical&snapshot=sha256%3A0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2020&to=2025&min=3.5&max=10&depth=1000&country=MEX&adm=MEX-2729&tab=quick&c=17.46028%2C-100.1254%2C8",
    "tab": "quick",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 7930,
    "quick": {
      "catalog": "ssn-mx-historical",
      "country": "MEX",
      "admin1": "MEX-2729",
      "yearFrom": 2020,
      "yearTo": 2025,
      "magMin": 3.5,
      "magType": "",
      "action": "statistics"
    },
    "focus": ".quick-answer"
  },
  "6": {
    "id": "6",
    "title": "Guerrero · enlarged map and tectonic context",
    "query": "v=5&lang=en&catalog=ssn-mx-historical&snapshot=sha256%3A0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2000&to=2026&min=4.5&max=10&depth=1000&country=MEX&adm=MEX-2729&c=17.5%2C-100.1%2C7&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 203,
    "expanded": true,
    "tectonics": true
  },
  "7": {
    "id": "7",
    "title": "Canada and Mexico · common USGS selection",
    "query": "v=3&lang=en&catalog=usgs-na-2020-2025&tab=comparison&from=2020&to=2025&min=4.5&max=10&mt=mww&depth=1000",
    "tab": "comparison",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "focus": "#comparisonWorkspace",
    "comparisonCounts": [
      15,
      53
    ]
  },
  "8": {
    "id": "8",
    "title": "Simple view · three direct routes",
    "query": "v=5&lang=en&catalog=ssn-mx-historical&snapshot=sha256%3A0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2020&to=2025&min=4.5&max=10&depth=1000&country=MEX&adm=MEX-2729&tab=quick&c=17.46595%2C-100.10193%2C7",
    "tab": "quick",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 44
  },
  "9a": {
    "id": "9a",
    "title": "Top10 · four catalogues automatically",
    "query": "v=4&lang=en&catalog=all-catalogs&tab=top&from=1900&to=2026&min=3.5&max=10&depth=1000",
    "tab": "top",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "focus": "#topWorkspace .history-observation"
  },
  "9b": {
    "id": "9b",
    "title": "Guerrero · historical proximity",
    "query": "v=5&lang=en&catalog=ssn-mx-historical&snapshot=sha256%3A0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2020&to=2025&min=3.5&max=10&depth=1000&country=MEX&adm=MEX-2729&tab=recurrence&c=17.46028%2C-100.1254%2C8",
    "tab": "recurrence",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "focus": "#recurrenceWorkspace .history-observation",
    "history": {
      "catalogueId": "ssn-mx-historical",
      "scope": "MEX",
      "admin1": "MEX-2729",
      "yearFrom": 1900,
      "yearTo": 2026,
      "magType": "__missing__",
      "minimumMagnitude": 7,
      "radiusKm": 50,
      "includeOffshore": false,
      "offshoreKm": 100
    }
  },
  "regional-a": {
    "id": "regional-a",
    "title": "Guerrero · SSN · requested 2000–2026",
    "query": "v=5&lang=en&catalog=ssn-mx-historical&snapshot=sha256%3A0601c65544bc95ef865d3440e5e6d84249acdebd8edfb379669597096543f993&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2000&to=2026&min=3.5&max=10&depth=1000&country=MEX&adm=MEX-2729&c=17.5%2C-100.1%2C7&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 19963,
    "expanded": true,
    "tectonics": true,
    "focus": ""
  },
  "regional-b": {
    "id": "regional-b",
    "title": "California · USGS · requested 2000–2026",
    "query": "v=5&lang=en&catalog=usgs-na-2020-2025&snapshot=8fe055ffe635875f7290906d45f70562a7896621&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2000&to=2026&min=3.5&max=10&depth=1000&country=USA&adm=USA-3521&c=37.2%2C-119.2%2C5.75&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 551,
    "expanded": true,
    "tectonics": true,
    "focus": ""
  },
  "regional-c": {
    "id": "regional-c",
    "title": "Yukon · NRCan · requested 2000–2026",
    "query": "v=5&lang=en&catalog=nrcan-ca-historical&snapshot=sha256%3Af10b91ddbc683406e2f1a642aa8a15fba3d1b46eef3a775f2798cfdc75a31241&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2000&to=2026&min=3.5&max=10&depth=1000&country=CAN&adm=CAN-636&c=64.8%2C-133%2C5&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 225,
    "expanded": true,
    "tectonics": true,
    "focus": ""
  },
  "regional-d": {
    "id": "regional-d",
    "title": "Alaska · all four catalogues · requested 2000–2026",
    "query": "v=5&lang=en&catalog=all-catalogs&snapshot=sha256%3A2b38efe4c043bcc4a73907944e3b40b94e9796d2fe8a55e2dd627ba99e4c96fd&geo=9063e0c34412fec41debad30f69a653486c18e0f94d5983e6a061847befe27cb&adh=2604708906c7a88861c1cc4fee9e21cfb4e7b1c7a451dee54ce6536c7ff3a1a9&from=2000&to=2026&min=3.5&max=10&depth=1000&country=USA&adm=USA-3563&c=62%2C-153%2C4&tab=catalog",
    "tab": "catalog",
    "language": "en",
    "theme": "blue",
    "appearance": "light",
    "expectedRows": 1112,
    "expanded": true,
    "tectonics": true,
    "focus": ""
  }
};
  function get(id){const value=Object.hasOwn(profiles,String(id))?profiles[String(id)]:null;return value?JSON.parse(JSON.stringify(value)):null;}
  function resolve(input){const url=new URL(input),profile=get(url.searchParams.get('figure'));if(!profile)return null;const expanded=new URL(url.href);expanded.search=profile.query;expanded.hash='';return {profile,url:expanded.href};}
  function link(id,base){if(!get(id))throw Error('Unknown article figure');const url=new URL(base);url.search='';url.hash='';url.searchParams.set('figure',id);url.searchParams.set('lang','en');return url.href;}
  return Object.freeze({get,resolve,link,ids:Object.freeze(Object.keys(profiles))});
});
