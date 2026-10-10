import {test,expect} from "@playwright/test";
import {errorCopy,technicalDetails} from "../src/services/errors";

test("No compatible release shows project, Minecraft and loader without opening technical details",()=>{
 const error={code:"content_incompatible",message:"No compatible release",context:{reason:"no_release",name:"Example Mod",required:"stable",actual:"Minecraft 26.2 / fabric"}};
 const copy=errorCopy(error,true);expect(copy.message).toContain("Example Mod");expect(copy.message).toContain("Minecraft 26.2 / Fabric");expect(copy.message).toContain("стабильного");expect(copy.message).not.toContain("content_incompatible");expect(copy.hint).toContain("beta/alpha");
 expect(errorCopy(error,false).message).toContain("no stable release");
});
test("Version and loader errors include both requirement and instance version",()=>{
 for(const [reason,required,actual] of [["minecraft","minecraft >=1.21 <1.22","26.2"],["loader","forge","fabric"],["loader_version","fabricloader >=0.16","0.15.0"]]){
  const copy=errorCopy({code:"content_incompatible",context:{reason,name:"Named Mod",required,actual}},true);expect(copy.message).toContain("Named Mod");expect(copy.message).toContain(actual==="fabric"?"Fabric":actual);expect(copy.message).not.toContain("content_incompatible");
 }
});
test("Missing or wrong dependency explains the exact mod and required version",()=>{
 const context={reason:"dependency_missing",name:"Iris",dependency:"sodium",required:">=0.6",actual:"0.5",other:"Sodium"};
 expect(errorCopy({code:"dependency",context},true).message).toContain("не установлен или выключен");
 const copy=errorCopy({code:"dependency",context:{...context,reason:"dependency_version"}},true);for(const name of ["Iris","Sodium",">=0.6","0.5"])expect(copy.message).toContain(name);
});
test("Declared conflicts and duplicate identities name both mods",()=>{
 for(const reason of ["conflict","duplicate"]){const copy=errorCopy({code:"content_duplicate",context:{reason,name:"Embeddium",other:"Sodium",actual:"0.6",dependency:"sodium"}},true);expect(copy.message).toContain("Embeddium");expect(copy.message).toContain("Sodium");expect(copy.hint).toContain("Текущие файлы не изменены");}
});
test("A loader failure shows the actual explanation, without treating every crash as incompatibility",()=>{
 const message="Incompatible mods found!\nMod 'Iris' requires Sodium 0.6; only 0.5 is present";
 const copy=errorCopy({code:"content_runtime_conflict",message},true);expect(copy.title).toBe("Моды не могут загрузиться");expect(copy.message).toContain(message);
 expect(errorCopy({code:"process_exit",message:"Minecraft exited with code 1"},true).family).toBe("launch");
});
test("Specific content explanations remain sanitized and technical data remains available",()=>{
 const error={code:"dependency",context:{reason:"conflict",name:"Example token=synthetic-secret",other:"Other Mod"}};
 expect(errorCopy(error,true).message).not.toContain("synthetic-secret");expect(technicalDetails(error)).not.toContain("synthetic-secret");expect(technicalDetails(error)).toContain("dependency");
 expect(errorCopy({code:"content_conflict",message:"Example Mod would replace Other Mod.jar"},false).message).toContain("Other Mod.jar");
});
