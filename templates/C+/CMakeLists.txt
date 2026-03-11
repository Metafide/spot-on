cmake_minimum_required(VERSION 3.16)
project(metafide_bot_cpp)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CURL REQUIRED)

add_executable(metafide-bot
    main.cpp
    request.cpp
    spot.cpp
    runner.cpp
)

target_include_directories(metafide-bot PRIVATE ${CURL_INCLUDE_DIRS})
target_link_libraries(metafide-bot PRIVATE ${CURL_LIBRARIES})