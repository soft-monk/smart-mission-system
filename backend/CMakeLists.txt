cmake_minimum_required(VERSION 3.20)
project(mapapp_backend CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(WIN32)
  # Drogon / Windows 头文件冲突防护
  add_compile_definitions(NOMINMAX WIN32_LEAN_AND_MEAN _WIN32_WINNT=0x0A00)
  add_compile_options(/utf-8 /MP)
endif()

# 依赖：由 vcpkg manifest 模式提供（backend/vcpkg.json）
find_package(Drogon CONFIG REQUIRED)
# vcpkg 的 sqlite3 提供 unofficial-sqlite3 目标；系统包则提供 SQLite::SQLite3
find_package(unofficial-sqlite3 CONFIG QUIET)
if(NOT unofficial-sqlite3_FOUND)
  find_package(SQLite3 REQUIRED)
endif()
find_package(nlohmann_json CONFIG REQUIRED)

if(TARGET unofficial::sqlite3::sqlite3)
  set(MAPAPP_SQLITE_TARGET unofficial::sqlite3::sqlite3)
else()
  set(MAPAPP_SQLITE_TARGET SQLite::SQLite3)
endif()

file(GLOB_RECURSE MAPAPP_SOURCES CONFIGURE_DEPENDS
  "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cc"
  "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp"
)

add_executable(mapapp ${MAPAPP_SOURCES})

target_include_directories(mapapp PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")

target_link_libraries(mapapp PRIVATE
  Drogon::Drogon
  ${MAPAPP_SQLITE_TARGET}
  nlohmann_json::nlohmann_json
)

# Drogon 在 Windows 下的额外系统库
if(WIN32)
  target_link_libraries(mapapp PRIVATE ws2_32 wsock32 iphlpapi)
endif()

# 运行期工作目录 = backend/，所以静态目录用相对路径
set_target_properties(mapapp PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/bin"
)

message(STATUS "mapapp backend configured (Drogon, sqlite3, nlohmann-json)")
