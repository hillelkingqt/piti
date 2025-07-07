#include <iostream>
#include <fstream>
#include <string>

int main() {
    // Open a file named a.txt in write mode.
    // std::ios::out indicates write mode.
    // If the file exists, its contents are erased.
    // If the file does not exist, it is created.
    std::ofstream outFile("a.txt");

    // Check if the file was opened successfully
    if (outFile.is_open()) {
        // Write a line to the file
        outFile << "Hello from Piti! This text was written by the C++ code.\n";
        outFile << "You can put any text you want here.\n";

        // Close the file
        outFile.close();
        std::cout << "Text successfully written to a.txt" << std::endl;
    } else {
        // If the file failed to open, print an error message
        std::cerr << "Error opening file!" << std::endl;
    }

    return 0;
}